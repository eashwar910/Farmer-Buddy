/**
 * Gemini AI Client Module
 *
 * Handles communication with Google's Gemini 1.5 Flash API
 * for visual summarization of video keyframes.
 */

// ============================================================================
// Prompt Engineering
// ============================================================================

const SUMMARIZATION_PROMPT = `You are an AI assistant analyzing security camera footage from employee body cameras.

You will be shown a series of keyframes (images) extracted from a video recording. Your task is to:

1. **Summarize the activity**: Describe what the employee was doing during this time period.
2. **Identify key events**: Note any significant moments, changes in location, interactions with others, or important actions.
3. **Timestamp notable moments**: Estimate when significant events occurred based on the sequence of frames.
4. **Flag any concerns**: Identify potential safety issues, policy violations, or unusual behavior (if any).

Provide a concise, structured summary in the following JSON format:

{
  "executive_summary": "Brief 2-3 sentence overview of the entire recording",
  "timeline": [
    {
      "frame_range": "Frame 1-5",
      "time_estimate": "0:00 - 0:50",
      "activity": "Description of what was happening"
    }
  ],
  "notable_events": [
    {
      "time_estimate": "1:30",
      "description": "What happened",
      "significance": "Why it's notable"
    }
  ],
  "safety_compliance": {
    "concerns": ["List any safety or compliance issues, or empty array if none"],
    "positive_observations": ["Good practices observed"]
  },
  "overall_assessment": "Brief professional assessment of the shift segment"
}

Important guidelines:
- Be objective and professional
- Focus on observable facts, not assumptions
- If you cannot see something clearly, say "unclear" or "not visible"
- Prioritize safety-related observations
- Keep descriptions concise but informative

Now analyze the following keyframes:`;

// ============================================================================
// Gemini API Integration
// ============================================================================

export async function summarizeKeyframes(keyframes, genAI) {
  if (!keyframes || keyframes.length === 0) {
    throw new Error('No keyframes provided for summarization');
  }

  console.log(`  🤖 Sending ${keyframes.length} keyframes to Gemini 1.5 Flash...`);

  try {
    // Use Gemini 1.5 Flash model (optimized for speed and cost)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // Build the content array with prompt + images
    const contents = [
      { text: SUMMARIZATION_PROMPT },
      ...keyframes,
    ];

    // Generate summary
    const result = await model.generateContent(contents);
    const response = await result.response;
    const text = response.text();

    console.log(`  ✅ Gemini response received (${text.length} characters)`);

    // Try to extract JSON from the response
    let summary = text;

    // If the response is wrapped in markdown code blocks, extract the JSON
    const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      summary = jsonMatch[1];
    } else {
      // Try to find JSON object in the response
      const jsonObjectMatch = text.match(/\{[\s\S]*\}/);
      if (jsonObjectMatch) {
        summary = jsonObjectMatch[0];
      }
    }

    // Validate it's valid JSON
    try {
      JSON.parse(summary);
      console.log(`  ✅ Valid JSON summary generated`);
    } catch (parseError) {
      console.warn(`  ⚠️  Response is not valid JSON, storing raw text`);
      // Wrap the raw text in a simple JSON structure
      summary = JSON.stringify({
        executive_summary: text.substring(0, 500),
        raw_response: text,
        parse_error: 'Response was not valid JSON',
      });
    }

    return summary;
  } catch (error) {
    console.error(`  ❌ Gemini API error:`, error);

    // Check for specific error types
    if (error.message.includes('quota')) {
      throw new Error('Gemini API quota exceeded. Please check your API limits.');
    } else if (error.message.includes('API key')) {
      throw new Error('Invalid Gemini API key. Please check your configuration.');
    } else {
      throw new Error(`Gemini API error: ${error.message}`);
    }
  }
}

// ============================================================================
// Utility: Estimate cost
// ============================================================================

export function estimateCost(keyframeCount) {
  // Gemini 1.5 Flash pricing (as of 2024):
  // - Input: $0.00001875 per 1K characters (text)
  // - Input: $0.00001875 per image
  // - Output: $0.000075 per 1K characters

  const imageInputCost = keyframeCount * 0.00001875;
  const promptCost = (SUMMARIZATION_PROMPT.length / 1000) * 0.00001875;
  const estimatedOutputCost = (2000 / 1000) * 0.000075; // Assume ~2K char output

  const totalCost = imageInputCost + promptCost + estimatedOutputCost;

  return {
    imageInputCost: imageInputCost.toFixed(6),
    promptCost: promptCost.toFixed(6),
    estimatedOutputCost: estimatedOutputCost.toFixed(6),
    totalCost: totalCost.toFixed(6),
  };
}
