// Bumped on every meaningful release. The client compares this constant
// against the value returned by GET /api/public/app-version and prompts the
// user to refresh when they differ — fixes the "old cached client showing
// 5 questions instead of 10" issue after a deploy.
//
// IMPORTANT: change this string whenever you ship a behavior change you
// want all users to receive immediately.
export const APP_VERSION = "2026-06-11.bg-timer-anticheat.3";
