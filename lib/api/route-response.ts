import { NextResponse } from 'next/server'

export type RouteErrorResponse = {
  status: number
  message: string
}

export function jsonErrorResponse({ message, status }: RouteErrorResponse) {
  return NextResponse.json({ message }, { status })
}

export function toIntegerParam(value: string | null, fallback: number) {
  const parsed = Number(value)

  return Number.isInteger(parsed) ? parsed : fallback
}
