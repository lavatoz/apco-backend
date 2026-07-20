import fs from 'fs';
import path from 'path';

function patchPdfEncrypt() {
  const targets = [
    path.resolve(process.cwd(), 'node_modules/@pdfsmaller/pdf-encrypt/dist/pdf-encrypt.js'),
    path.resolve(process.cwd(), 'node_modules/@pdfsmaller/pdf-encrypt/dist/pdf-encrypt.mjs'),
  ];

  for (const target of targets) {
    if (fs.existsSync(target)) {
      let code = fs.readFileSync(target, 'utf-8');
      if (!code.includes("keyName !== '/URI'")) {
        console.log(`Patching ${target}...`);
        code = code.replace(
          "if (keyName !== '/Length' && keyName !== '/Filter' && keyName !== '/DecodeParms') {",
          "if (keyName !== '/Length' && keyName !== '/Filter' && keyName !== '/DecodeParms' && keyName !== '/URI') {"
        );
        fs.writeFileSync(target, code, 'utf-8');
        console.log(`✅ Successfully patched ${target}`);
      } else {
        console.log(`Already patched: ${target}`);
      }
    }
  }
}

patchPdfEncrypt();
