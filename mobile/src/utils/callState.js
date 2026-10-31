// Shared between AppContext and CallScreen: while a host is on a call, a new
// caller joining that call is answered in the call screen, not a full-screen ring.
export const activeCall = { hostInCall: false };
