import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api';
import { getSessionUser } from '@/lib/session';

/** Публичные STUN-серверы: узнать свой внешний адрес; трафик через них не идёт */
const DEFAULT_ICE: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
];

/**
 * GET /api/rtc/config — ICE-серверы для созвона на доске. TURN (ретрансляция
 * для строгих NAT и корпоративных сетей) задаётся в RTC_ICE_SERVERS (JSON) и
 * выдаётся только вошедшим пользователям — его учётные данные не для всех.
 */
export const GET = withErrorHandling(async () => {
  const user = await getSessionUser();
  let configured: RTCIceServer[] = [];
  try {
    configured = process.env.RTC_ICE_SERVERS
      ? (JSON.parse(process.env.RTC_ICE_SERVERS) as RTCIceServer[])
      : [];
  } catch {
    configured = [];
  }
  const withTurn = user ? configured : configured.filter((s) => !s.username);
  return NextResponse.json(
    { iceServers: [...DEFAULT_ICE, ...withTurn] },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
});
