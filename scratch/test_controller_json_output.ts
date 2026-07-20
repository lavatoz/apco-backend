import { verifyDocumentByIdController } from '../src/modules/public/public.controller';

async function testResponse() {
  console.log('🧪 Testing GET /api/verify/AK-DOC-2026-000009 HTTP response...');

  const req: any = {
    params: { documentId: 'AK-DOC-2026-000009' },
    ip: '127.0.0.1',
    headers: { 'user-agent': 'test-agent' }
  };

  let statusCode = 0;
  let responseData: any = null;

  const res: any = {
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    json: (data: any) => {
      responseData = data;
      return res;
    }
  };

  const next = (err?: any) => {
    if (err) console.error('Next error:', err);
  };

  await verifyDocumentByIdController(req, res, next);

  console.log(`HTTP Status: ${statusCode}`);
  console.log('JSON Payload:', JSON.stringify(responseData, null, 2));
}

testResponse().catch(console.error);
