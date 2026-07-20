import fs from 'fs';
import path from 'path';

function patchPdfEncryptToUseHexStrings() {
  const targets = [
    path.resolve(process.cwd(), 'node_modules/@pdfsmaller/pdf-encrypt/dist/pdf-encrypt.js'),
    path.resolve(process.cwd(), 'node_modules/@pdfsmaller/pdf-encrypt/dist/pdf-encrypt.mjs'),
  ];

  for (const target of targets) {
    if (fs.existsSync(target)) {
      let code = fs.readFileSync(target, 'utf-8');
      
      // In encryptStringsAES256 and encryptStringsRC4:
      // Replace obj instanceof PDFString encryption handling to convert encrypted bytes to PDFHexString or safe bytes
      // Let's check how PDFString is converted in pdf-encrypt.js:
      // obj.value = Array.from(encrypted).map(b => String.fromCharCode(b)).join('');
      // If we change PDFString encryption handling to output PDFHexString or hex format:
      if (code.includes("obj.value = Array.from(encrypted).map(b => String.fromCharCode(b)).join('');")) {
        console.log(`Patching string encryption in ${target}...`);
        code = code.replaceAll(
          "obj.value = Array.from(encrypted).map(b => String.fromCharCode(b)).join('');",
          "obj.value = bytesToHex(encrypted);"
        );
        // Also ensure PDFString behaves as hex or hex string is returned
        fs.writeFileSync(target, code, 'utf-8');
        console.log(`✅ Successfully patched ${target} to use hex strings for encrypted values.`);
      } else {
        console.log(`Already using safe hex strings or snippet not found in: ${target}`);
      }
    }
  }
}

patchPdfEncryptToUseHexStrings();
