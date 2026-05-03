const fs = require('fs');
async function read() {
  const mod = await import('pdf-parse');
  const pdf = mod.PDFParse;
  let dataBuffer = fs.readFileSync('C:\\Users\\MIDO\\Downloads\\dashboard_report_2026-04-28_19-50-08.pdf');
  pdf(dataBuffer).then(function(data) {
      console.log("PDF TEXT START");
      console.log(data.text);
  }).catch(console.error);
}
read();
