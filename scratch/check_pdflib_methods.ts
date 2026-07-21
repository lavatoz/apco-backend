import { PDFPage, PDFDocument } from 'pdf-lib';

console.log('PDFPage methods:', Object.getOwnPropertyNames(PDFPage.prototype));
console.log('PDFDocument methods:', Object.getOwnPropertyNames(PDFDocument.prototype));
