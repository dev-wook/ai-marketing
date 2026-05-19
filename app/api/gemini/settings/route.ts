import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    textModel: process.env.GEMINI_TEXT_MODEL ?? 'gemini-2.5-flash',
    freeTierMode: true,
    apiKeyConfigured: Boolean(process.env.GEMINI_API_KEY),
    statusMessage: process.env.GEMINI_API_KEY
      ? 'Gemini API 키가 설정되어 있습니다.'
      : 'GEMINI_API_KEY 환경변수가 아직 설정되지 않았습니다.',
  })
}
