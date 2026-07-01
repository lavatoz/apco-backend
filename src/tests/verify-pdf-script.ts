import { generateAgreementPdf } from '../services/agreement-pdf.service';
import { prisma } from '../config/database';
import { StandaloneAgreementsService } from '../modules/standalone-agreements/standalone-agreements.service';
import fs from 'fs';
import path from 'path';
const pdf: any = require('pdf-parse');

async function verify() {
  console.log('🔄 Running local PDF generation & validation test...');
  console.log('PDF TYPE:', typeof pdf, Object.keys(pdf || {}));
  
  const mockData = {
    clientName: 'Alice Smith',
    brideName: 'Alice',
    groomName: 'Bob',
    eventName: 'Wedding Ceremony',
    eventDate: '12 December 2026',
    venue: 'Grand Plaza Hall',
    totalAmount: 'Rs. 1,50,000',
    advanceAmount: 'Rs. 50,000',
    balanceAmount: 'Rs. 1,00,000',
    todayDate: '25 June 2026',
    quotationNumber: 'QT-2026-001',
    invoiceNumber: 'INV-2026-001',
    companyName: 'APCO Productions',
    companyTagline: 'Capturing memories forever',
    companyPhone: '+1-555-0199',
    companyEmail: 'contact@apco.com',
    companyAddress: '123 Creative Lane, Media City',
    primaryColor: '#0052cc',
    templateVersion: '1.2'
  };

  const issues: string[] = [];
  const placeholders = [
    '{{CLIENT_NAME}}',
    '{{EVENT_NAME}}',
    '{{EVENT_DATE}}',
    '{{TODAY_DATE}}',
    '{{TOTAL_AMOUNT}}',
    '{{ADVANCE_AMOUNT}}',
    '{{BALANCE_AMOUNT}}'
  ];

  try {
    // 1. Verify Project Agreement PDF
    console.log('🔄 Verifying Project Agreement PDF Generation...');
    const pdfBuffer = await generateAgreementPdf(mockData);
    
    const parsed = new pdf.PDFParse(new Uint8Array(pdfBuffer));
    const textObj = await parsed.getText();
    const text = textObj.text || "";
    console.log('\n📄 --- PARSED PROJECT PDF TEXT SNAPSHOT ---');
    console.log(text.slice(0, 1000));
    console.log('-------------------------------------------\n');

    // Check placeholders in project PDF
    for (const placeholder of placeholders) {
      if (text.includes(placeholder)) {
        issues.push(`❌ Found placeholder in Project PDF: ${placeholder}`);
      }
    }

    // Check formatting markers in project PDF
    if (text.includes('%i')) {
      issues.push('❌ Found formatting marker "%i" in Project PDF');
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.includes('%i')) {
          console.log(`  Line: "${line.trim()}"`);
        }
      }
    }

    // 2. Verify Standalone Agreement PDF from database
    console.log('🔍 Querying Standalone Agreements from database...');
    const agreements = await prisma.standaloneAgreement.findMany({
      include: { client: true, template: true }
    });
    console.log(`Found ${agreements.length} standalone agreements:`);
    for (const agr of agreements) {
      console.log(`- ID: ${agr.id}, Client: ${agr.client.name}, Status: ${agr.status}`);
      if (agr.status === 'SIGNED') {
        console.log(`  Generating PDF for signed agreement ID ${agr.id}...`);
        const relativePath = await StandaloneAgreementsService.generateSignedAgreementPdf(agr.id);
        const absolutePath = path.join(process.cwd(), relativePath);
        console.log(`  PDF path on disk: ${absolutePath}`);
        
        if (fs.existsSync(absolutePath)) {
          const buffer = fs.readFileSync(absolutePath);
          const parsedAgr = new pdf.PDFParse(new Uint8Array(buffer));
          const textObjAgr = await parsedAgr.getText();
          const textAgr = textObjAgr.text || "";
          
          console.log('\n📄 --- PARSED STANDALONE PDF TEXT SNAPSHOT ---');
          console.log(textAgr.slice(0, 1000));
          console.log('----------------------------------------------\n');
          
          for (const placeholder of placeholders) {
            if (textAgr.includes(placeholder)) {
              issues.push(`❌ Found placeholder in Standalone PDF (${agr.id}): ${placeholder}`);
            }
          }
          if (textAgr.includes('%i')) {
            issues.push(`❌ Found formatting marker "%i" in Standalone PDF (${agr.id})`);
            const lines = textAgr.split('\n');
            for (const line of lines) {
              if (line.includes('%i')) {
                console.log(`  Line: "${line.trim()}"`);
              }
            }
          }
        } else {
          issues.push(`❌ Standalone PDF file not found on disk at: ${absolutePath}`);
        }
      }
    }

    if (issues.length > 0) {
      console.error('\n⚠️ Validation failed with issues:');
      issues.forEach(issue => console.error(issue));
      process.exit(1);
    } else {
      console.log('\n✅ Validation passed successfully! No placeholders or formatting markers found.');
      process.exit(0);
    }
  } catch (error) {
    console.error('❌ Failed to run validation:', error);
    process.exit(1);
  }
}

verify();

