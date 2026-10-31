export type CallType = 'voice' | 'video';

export type CallStatus =
  | 'idle'
  | 'calling'     // Caller is dialing / waiting for response
  | 'ringing'     // Callee sees incoming call screen
  | 'accepted'    // Callee accepted, waiting for media connection
  | 'connected'   // Media stream connected
  | 'ended'       // Call normally ended
  | 'rejected'    // Callee declined the call
  | 'missed'      // Callee did not answer within timeout
  | 'busy'        // Callee was already in another call
  | 'cancelled';  // Caller hung up before answer

export type CallRole = 'caller' | 'callee';

export type CallSession = {
  callId: string;
  channelId: string;
  chatId?: string;
  callType: CallType;
  status: CallStatus;
  role: CallRole;
  otherUserId: string;
  otherUserName: string;
  otherUserAvatar?: string | null;
  connectedAt?: number;
  duration: number; // in seconds
  isMuted: boolean;
  isSpeaker: boolean;
  isVideoEnabled: boolean;
  isFrontCamera: boolean;
  localUid?: number;
  remoteUid?: number;
};

export type CallSignalType =
  | 'call_invite'
  | 'call_ringing'
  | 'call_accepted'
  | 'call_rejected'
  | 'call_busy'
  | 'call_cancelled'
  | 'call_ended';

export type CallSignal = {
  type: CallSignalType;
  callId: string;
  channelId: string;
  chatId?: string;
  callerId: string;
  callerName: string;
  callerAvatar?: string | null;
  receiverId: string;
  callType: CallType;
  timestamp: number;
};

export type AgoraTokenResponse = {
  token: string;
  channelName: string;
  uid: number;
  appId: string;
};
