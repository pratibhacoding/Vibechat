import { Platform } from 'react-native';

export type AgoraEventCallbacks = {
  onJoinSuccess?: (channel: string, uid: number) => void;
  onUserJoined?: (uid: number) => void;
  onUserOffline?: (uid: number) => void;
  onError?: (errCode: number, message: string) => void;
};

export type PermissionCheckResult = {
  granted: boolean;
  audioGranted: boolean;
  cameraGranted: boolean;
  bluetoothGranted: boolean;
  errorMessage?: string;
};

export type IRtcEngine = unknown;

class AgoraService {
  private engine: IRtcEngine | null = null;
  private isInitialized = false;
  private currentAppId: string | null = null;

  public async requestPermissions(callType: 'voice' | 'video'): Promise<PermissionCheckResult> {
    if (Platform.OS === 'web') {
      return {
        granted: false,
        audioGranted: false,
        cameraGranted: false,
        bluetoothGranted: false,
        errorMessage: 'Agora calls are not available on the web version of VibeChat.',
      };
    }

    return {
      granted: true,
      audioGranted: true,
      cameraGranted: callType !== 'video',
      bluetoothGranted: true,
    };
  }

  public async initializeEngine(_appId: string, _callbacks: AgoraEventCallbacks): Promise<IRtcEngine | null> {
    console.warn('Agora Native SDK is not supported on Web. Call features are disabled in this build.');
    return null;
  }

  public async join(_token: string, _channelName: string, _uid: number, _callType: 'voice' | 'video'): Promise<boolean> {
    return false;
  }

  public setMute(_isMuted: boolean): void {}

  public setSpeaker(_isSpeaker: boolean): void {}

  public setVideoEnabled(_isEnabled: boolean): void {}

  public switchCamera(): void {}

  public async leave(): Promise<void> {}

  public release(): void {
    this.engine = null;
    this.isInitialized = false;
    this.currentAppId = null;
  }

  public getEngine(): IRtcEngine | null {
    return this.engine;
  }
}

export const agoraService = new AgoraService();
