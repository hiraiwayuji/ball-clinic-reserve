import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const logPath = path.join(process.cwd(), 'public', 'line_debug.txt');
    if (fs.existsSync(logPath)) {
      const content = fs.readFileSync(logPath, 'utf8');
      return new NextResponse(content, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    return new NextResponse('Log file not found yet. Please make sure the "public" directory exists and you have sent at least one LINE message.', { status: 404 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
