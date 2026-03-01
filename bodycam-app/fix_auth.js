const fs = require('fs');
const files = [
  'supabase/functions/generate-livekit-token/index.ts',
  'supabase/functions/start-egress/index.ts',
  'supabase/functions/stop-egress/index.ts'
];

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  
  // Replace the broken padding script
  const brokenCode = `      // Pad base64 if needed
      const padded = base64Payload + '=='.slice(base64Payload.length % 4 || 4);
      const payload = JSON.parse(atob(padded));`;
      
  const correctCode = `      let base64 = base64Payload.replace(/-/g, '+').replace(/_/g, '/');
      const padLen = (4 - (base64.length % 4)) % 4;
      base64 += "=".repeat(padLen);
      const payload = JSON.parse(atob(base64));`;
      
  if (content.includes(brokenCode)) {
    content = content.replace(brokenCode, correctCode);
    fs.writeFileSync(file, content);
    console.log('Fixed', file);
  } else {
    console.log('Could not find broken code in', file);
  }
}
