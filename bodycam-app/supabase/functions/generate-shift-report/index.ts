import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { PDFDocument, rgb, StandardFonts } from 'https://esm.sh/pdf-lib@1.17.1';
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.18';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const REPORT_PROMPT = (employeeName: string, shiftDate: string, summaries: string) => `
You are generating a professional end-of-shift report for an employee based on AI-analyzed body camera footage.

Employee: ${employeeName}
Shift Date: ${shiftDate}

Below are the AI summaries for each 1-minute chunk of the shift, in chronological order:

${summaries}

Generate a comprehensive shift report in the following JSON structure. Be specific and professional. Only include timeline entries for genuinely significant events (safety issues, equipment use, incidents, notable work). If there are no violations, say so clearly.

Respond ONLY with valid JSON:
{
  "executive_summary": "2-3 sentence overall shift summary",
  "important_timeline": [
    { "time": "HH:MM", "event": "What happened — be specific" }
  ],
  "safety_violations": [
    "Description of violation (or empty array if none)"
  ],
  "activity_distribution": [
    { "activity": "Activity name", "percentage": 25 }
  ],
  "machinery_involved": [
    "Equipment/tool name"
  ],
  "overall_assessment": "Professional evaluation of the employee's performance and conduct during the shift"
}

For activity_distribution, ensure percentages sum to 100. Common activities: Operating machinery, Walking/patrolling, Paperwork/admin, Idle/waiting, Communication, Physical labor.
`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── 1. Auth check ─────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 2. Parse body ─────────────────────────────────────────────────────────
    const { shiftId, employeeId } = await req.json();
    if (!shiftId || !employeeId) {
      return new Response(JSON.stringify({ error: 'shiftId and employeeId are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 3. Supabase client ────────────────────────────────────────────────────
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // ── 4. Fetch employee info ────────────────────────────────────────────────
    const { data: employeeData, error: empError } = await supabase
      .from('users')
      .select('name, email')
      .eq('id', employeeId)
      .single();

    if (empError || !employeeData) {
      return new Response(JSON.stringify({ error: 'Employee not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const employeeName = (employeeData as any).name ?? 'Unknown Employee';

    // ── 5. Fetch shift info ───────────────────────────────────────────────────
    const { data: shiftData, error: shiftError } = await supabase
      .from('shifts')
      .select('started_at, ended_at, status')
      .eq('id', shiftId)
      .single();

    if (shiftError || !shiftData) {
      return new Response(JSON.stringify({ error: 'Shift not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const shift = shiftData as any;
    const shiftDate = new Date(shift.started_at).toLocaleDateString('en-GB', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });

    // ── 6. Fetch all completed recordings with summaries ──────────────────────
    const { data: recordings, error: recError } = await supabase
      .from('recordings')
      .select('id, chunk_index, started_at, ended_at, summary, processing_status')
      .eq('shift_id', shiftId)
      .eq('employee_id', employeeId)
      .eq('processing_status', 'completed')
      .order('chunk_index', { ascending: true });

    if (recError) {
      return new Response(JSON.stringify({ error: 'Failed to fetch recordings' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!recordings || recordings.length === 0) {
      return new Response(JSON.stringify({ error: 'No completed summaries found for this employee' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Generating report for ${employeeName}: ${recordings.length} chunks`);

    // ── 7. Build summary context ──────────────────────────────────────────────
    const summaryContext = (recordings as any[]).map((rec, idx) => {
      const startTime = rec.started_at
        ? new Date(rec.started_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
        : `Chunk ${idx + 1}`;
      const endTime = rec.ended_at
        ? new Date(rec.ended_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
        : '';
      return `--- Chunk ${idx + 1} (${startTime}${endTime ? ` – ${endTime}` : ''}) ---\n${rec.summary ?? 'No summary available'}`;
    }).join('\n\n');

    // ── 8. Calculate total time worked ────────────────────────────────────────
    const firstRec = (recordings as any[])[0];
    const lastRec = (recordings as any[])[recordings.length - 1];
    const startMs = new Date(firstRec.started_at).getTime();
    const endMs = lastRec.ended_at ? new Date(lastRec.ended_at).getTime() : Date.now();
    const totalMins = Math.round((endMs - startMs) / 60000);
    const hoursWorked = Math.floor(totalMins / 60);
    const minsWorked = totalMins % 60;
    const timeWorkedStr = `${hoursWorked}h ${minsWorked}m`;

    // ── 9. Call Gemini to generate the report ─────────────────────────────────
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: REPORT_PROMPT(employeeName, shiftDate, summaryContext) }],
          }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      throw new Error(`Gemini API error ${geminiRes.status}: ${errText.slice(0, 300)}`);
    }

    const geminiData = await geminiRes.json();
    const rawText: string = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    const reportJson = extractJson(rawText);
    let report: any = {};
    try {
      report = JSON.parse(reportJson);
    } catch {
      report = { executive_summary: rawText, important_timeline: [], safety_violations: [], activity_distribution: [], machinery_involved: [], overall_assessment: '' };
    }

    // ── 10. Generate PDF ──────────────────────────────────────────────────────
    const pdfBytes = await generatePdf({
      employeeName,
      shiftDate,
      timeWorked: timeWorkedStr,
      chunkCount: recordings.length,
      report,
      generatedAt: new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }),
    });

    // ── 11. Upload PDF to DO Spaces ───────────────────────────────────────────
    const s3Key    = Deno.env.get('DO_SPACES_KEY') ?? '';
    const s3Secret = Deno.env.get('DO_SPACES_SECRET') ?? '';
    const s3Region = Deno.env.get('S3_REGION') ?? 'sgp1';
    const activeRegion = s3Region === 'ap-southeast-1' ? 'sgp1' : s3Region;
    const s3Bucket = Deno.env.get('DO_SPACES_BUCKET') ?? '';

    const filePath = `${shiftId}/${employeeId}/report.pdf`;
    const uploadUrl = `https://${activeRegion}.digitaloceanspaces.com/${s3Bucket}/${filePath}`;

    const aws = new AwsClient({
      accessKeyId: s3Key,
      secretAccessKey: s3Secret,
      region: 'us-east-1',
      service: 's3',
    });

    const uploadRes = await aws.fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(pdfBytes.byteLength),
        'x-amz-acl': 'public-read',
      },
      body: pdfBytes,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Failed to upload PDF to DO Spaces: ${uploadRes.status} ${errText}`);
    }

    const reportUrl = uploadUrl;
    console.log('PDF uploaded to:', reportUrl);

    // ── 12. Upsert into shift_reports table ───────────────────────────────────
    const { error: upsertError } = await supabase
      .from('shift_reports')
      .upsert({
        shift_id: shiftId,
        employee_id: employeeId,
        report_url: reportUrl,
        generated_at: new Date().toISOString(),
      }, {
        onConflict: 'shift_id,employee_id',
        ignoreDuplicates: false,
      });

    if (upsertError) {
      console.error('Failed to upsert shift_reports row:', upsertError);
      // Non-fatal — URL was uploaded, return it anyway
    }

    return new Response(JSON.stringify({ success: true, reportUrl }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('generate-shift-report error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error', detail: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// ── PDF Generation ────────────────────────────────────────────────────────────

interface PdfOptions {
  employeeName: string;
  shiftDate: string;
  timeWorked: string;
  chunkCount: number;
  report: any;
  generatedAt: string;
}

async function generatePdf(opts: PdfOptions): Promise<Uint8Array> {
  const { employeeName, shiftDate, timeWorked, chunkCount, report, generatedAt } = opts;

  const doc = await PDFDocument.create();
  const boldFont   = await doc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await doc.embedFont(StandardFonts.Helvetica);

  // Colours
  const darkBlue  = rgb(0.059, 0.090, 0.165);  // #0F172A
  const accent    = rgb(0.231, 0.510, 0.965);   // #3B82F6
  const red       = rgb(0.937, 0.267, 0.267);   // #EF4444
  const green     = rgb(0.133, 0.773, 0.369);   // #22C55E
  const white     = rgb(1, 1, 1);
  const lightGrey = rgb(0.89, 0.906, 0.925);    // #E2E8F0
  const darkGrey  = rgb(0.392, 0.455, 0.545);   // #64748B

  const pageWidth  = 595.28; // A4
  const pageHeight = 841.89;
  const margin     = 48;
  const contentWidth = pageWidth - margin * 2;

  let page = doc.addPage([pageWidth, pageHeight]);
  let y    = pageHeight;

  // ── Helper draw functions ──────────────────────────────────────────────────

  function newPage() {
    page = doc.addPage([pageWidth, pageHeight]);
    y = pageHeight - margin;
  }

  function checkSpace(needed: number) {
    if (y - needed < margin + 20) newPage();
  }

  function drawRect(x: number, yPos: number, w: number, h: number, color: ReturnType<typeof rgb>) {
    page.drawRectangle({ x, y: yPos, width: w, height: h, color });
  }

  function drawText(
    text: string,
    x: number,
    yPos: number,
    size: number,
    color: ReturnType<typeof rgb>,
    font: typeof boldFont,
    maxWidth?: number
  ) {
    const opts: any = { x, y: yPos, size, color, font };
    if (maxWidth) opts.maxWidth = maxWidth;
    page.drawText(text, opts);
  }

  function wrapText(text: string, maxWidth: number, font: typeof regularFont, size: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      const w = font.widthOfTextAtSize(candidate, size);
      if (w > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  function drawWrappedText(
    text: string,
    x: number,
    startY: number,
    size: number,
    color: ReturnType<typeof rgb>,
    font: typeof regularFont,
    maxWidth: number,
    lineHeight: number
  ): number {
    const lines = wrapText(text, maxWidth, font, size);
    for (const line of lines) {
      checkSpace(lineHeight + 4);
      drawText(line, x, y, size, color, font);
      y -= lineHeight;
    }
    return y;
  }

  function sectionHeader(title: string) {
    checkSpace(40);
    y -= 16;
    drawRect(margin, y - 4, contentWidth, 26, accent);
    drawText(title, margin + 10, y + 6, 11, white, boldFont);
    y -= 28;
  }

  // ── 1. Header Banner ──────────────────────────────────────────────────────

  drawRect(0, pageHeight - 90, pageWidth, 90, darkBlue);
  drawText('FarmerBuddy', margin, pageHeight - 34, 20, white, boldFont);
  drawText('Shift Report', margin, pageHeight - 56, 13, accent, regularFont);
  const generatedLabel = `Generated: ${generatedAt}`;
  const labelWidth = regularFont.widthOfTextAtSize(generatedLabel, 9);
  drawText(generatedLabel, pageWidth - margin - labelWidth, pageHeight - 34, 9, lightGrey, regularFont);

  y = pageHeight - 90 - 16;

  // ── 2. Employee Info Box ──────────────────────────────────────────────────

  drawRect(margin, y - 64, contentWidth, 64, rgb(0.118, 0.161, 0.235));
  drawText(employeeName, margin + 16, y - 20, 15, white, boldFont);
  drawText(shiftDate, margin + 16, y - 40, 11, lightGrey, regularFont);

  // Stats row
  const stats = [
    { label: 'Time Worked', value: timeWorked },
    { label: 'Chunks Analysed', value: String(chunkCount) },
    { label: 'Violations', value: String((report.safety_violations ?? []).filter((v: string) => v && v.toLowerCase() !== 'none').length) },
  ];
  stats.forEach((stat, i) => {
    const statX = pageWidth - margin - 16 - (stats.length - 1 - i) * 110;
    drawText(stat.value, statX, y - 24, 14, white, boldFont);
    drawText(stat.label, statX, y - 42, 9, darkGrey, regularFont);
  });

  y -= 80;

  // ── 3. Executive Summary ──────────────────────────────────────────────────

  sectionHeader('Executive Summary');
  y -= 4;
  if (report.executive_summary) {
    drawWrappedText(sanitize(report.executive_summary), margin, y, 10, rgb(0.2, 0.2, 0.2), regularFont, contentWidth, 15);
  }
  y -= 8;

  // ── 4. Timeline of Important Events ──────────────────────────────────────

  sectionHeader('Timeline of Important Events');
  const timeline: any[] = report.important_timeline ?? [];
  if (timeline.length === 0) {
    checkSpace(20);
    drawText('No significant events recorded during this shift.', margin, y, 10, darkGrey, regularFont);
    y -= 20;
  } else {
    for (const item of timeline) {
      checkSpace(32);
      y -= 4;
      drawRect(margin, y - 14, 3, 14, accent);
      drawText(String(item.time ?? ''), margin + 10, y, 9, accent, boldFont);
      const eventText = sanitize(String(item.event ?? ''));
      drawWrappedText(eventText, margin + 62, y, 10, rgb(0.15, 0.15, 0.15), regularFont, contentWidth - 68, 14);
      y -= 8;
    }
  }
  y -= 8;

  // ── 5. Safety Protocol Violations ────────────────────────────────────────

  sectionHeader('Safety Protocol Violations');
  const violations: string[] = (report.safety_violations ?? []).filter((v: string) => v && v.toLowerCase() !== 'none' && v.trim() !== '');
  if (violations.length === 0) {
    checkSpace(20);
    drawRect(margin, y - 20, contentWidth, 20, rgb(0.8, 0.95, 0.84));
    drawText('No safety protocol violations observed during this shift.', margin + 10, y - 14, 10, rgb(0.1, 0.5, 0.2), boldFont);
    y -= 28;
  } else {
    for (const v of violations) {
      checkSpace(28);
      y -= 4;
      drawRect(margin, y - 18, contentWidth, 18, rgb(1, 0.93, 0.93));
      drawRect(margin, y - 18, 4, 18, red);
      drawWrappedText(`[!] ${sanitize(v)}`, margin + 12, y - 4, 10, red, regularFont, contentWidth - 20, 14);
      y -= 4;
    }
    y -= 8;
  }

  // ── 6. Activity Distribution ──────────────────────────────────────────────

  sectionHeader('Activity Distribution');
  const activities: { activity: string; percentage: number }[] = report.activity_distribution ?? [];
  if (activities.length === 0) {
    checkSpace(20);
    drawText('No activity data available.', margin, y, 10, darkGrey, regularFont);
    y -= 20;
  } else {
    const barHeight = 16;
    const barMaxWidth = contentWidth - 130;
    for (const act of activities) {
      checkSpace(barHeight + 10);
      y -= 6;
      const pct = Math.min(100, Math.max(0, act.percentage ?? 0));
      const label = String(act.activity ?? '');
      // Label
      drawText(label, margin, y, 9, rgb(0.2, 0.2, 0.2), regularFont);
      // Bar background
      drawRect(margin + 130, y - 4, barMaxWidth, barHeight - 4, lightGrey);
      // Bar fill
      if (pct > 0) {
        drawRect(margin + 130, y - 4, barMaxWidth * (pct / 100), barHeight - 4, accent);
      }
      // Percentage text
      drawText(`${pct}%`, margin + 130 + barMaxWidth + 6, y, 9, darkGrey, regularFont);
      y -= barHeight;
    }
  }
  y -= 8;

  // ── 7. Machinery Involved ─────────────────────────────────────────────────

  sectionHeader('Machinery & Equipment Involved');
  const machinery: string[] = report.machinery_involved ?? [];
  if (machinery.length === 0) {
    checkSpace(20);
    drawText('No specific machinery or equipment recorded.', margin, y, 10, darkGrey, regularFont);
    y -= 20;
  } else {
    const cols = 2;
    let col = 0;
    for (const item of machinery) {
      checkSpace(20);
      const xPos = margin + col * (contentWidth / cols);
      if (col === 0) y -= 4;
      drawText(`- ${sanitize(item)}`, xPos, y, 10, rgb(0.2, 0.2, 0.2), regularFont);
      col++;
      if (col >= cols) { col = 0; y -= 16; }
    }
    if (col > 0) y -= 16;
    y -= 4;
  }

  // ── 8. Overall Assessment ─────────────────────────────────────────────────

  sectionHeader('Overall Assessment');
  if (report.overall_assessment) {
    drawWrappedText(sanitize(report.overall_assessment), margin, y, 10, rgb(0.2, 0.2, 0.2), regularFont, contentWidth, 15);
  }
  y -= 8;

  // ── 9. Footer (all pages) ─────────────────────────────────────────────────

  const pages = doc.getPages();
  pages.forEach((pg, i) => {
    pg.drawRectangle({ x: 0, y: 0, width: pageWidth, height: 30, color: darkBlue });
    pg.drawText(`FarmerBuddy Shift Report - ${sanitize(employeeName)}`, { x: margin, y: 10, size: 8, color: lightGrey, font: regularFont });
    pg.drawText(`Page ${i + 1} of ${pages.length}`, { x: pageWidth - margin - 50, y: 10, size: 8, color: lightGrey, font: regularFont });
  });

  return await doc.save();
}

// ── Utility ───────────────────────────────────────────────────────────────────

function extractJson(raw: string): string {
  const jsonMatch = raw.match(/```json\n([\s\S]*?)\n```/);
  if (jsonMatch) return jsonMatch[1];
  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (objMatch) return objMatch[0];
  return '{}';
}

/**
 * Strip any characters outside the WinAnsi range (0x00-0xFF) so pdf-lib
 * standard fonts (Helvetica, HelveticaBold) don't throw encoding errors.
 * Emojis, smart quotes, arrows etc. are replaced or removed.
 */
function sanitize(text: string): string {
  return (text ?? '')
    // Replace common smart punctuation with ASCII equivalents
    .replace(/\u2014|\u2013/g, '-')   // em/en dash
    .replace(/\u2018|\u2019/g, "'")   // curly single quotes
    .replace(/\u201C|\u201D/g, '"')   // curly double quotes
    .replace(/\u2026/g, '...')         // ellipsis
    .replace(/\u2192/g, '->')          // arrow right
    .replace(/\u2022/g, '-')           // bullet
    // Strip anything outside Latin-1 (i.e., code point > 255)
    .replace(/[^\x00-\xFF]/g, '');
}
