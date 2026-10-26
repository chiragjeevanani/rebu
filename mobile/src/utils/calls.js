// Call outcomes shared by the call-ended screen and call history.
// `charged: false` outcomes never cost the caller anything.
export const CALL_STATUS = {
  completed: { label: 'Call ended', charged: true },
  no_answer: {
    label: 'No answer',
    note: 'They didn’t pick up. No coins were charged.',
    charged: false,
  },
  declined: {
    label: 'Call declined',
    note: 'They’re busy right now. No coins were charged.',
    charged: false,
  },
  cancelled: {
    label: 'Call cancelled',
    note: 'You hung up before the call connected. No coins were charged.',
    charged: false,
  },
  failed: {
    label: 'Call failed',
    note: 'The call couldn’t connect. No coins were charged.',
    charged: false,
  },
  dropped: {
    label: 'Call dropped',
    note: 'The connection was lost. You were only charged for connected minutes.',
    charged: true,
  },
  balance: {
    label: 'Out of coins',
    note: 'The call ended because your balance couldn’t cover the next minute.',
    charged: true,
  },
};

export const callStatus = key => CALL_STATUS[key] || CALL_STATUS.completed;

// Server reasons → the outcome keys the call-ended screen knows.
export const OUTCOME = {
  hangup: 'completed',
  no_coins: 'balance',
  timeout: 'no_answer',
  declined: 'declined',
  cancelled: 'cancelled',
  disconnect: 'dropped',
  server_restart: 'dropped',
  error: 'failed',
};
