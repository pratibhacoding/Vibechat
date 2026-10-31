import { Platform, PermissionsAndroid } from 'react-native';
import {
  createAgoraRtcEngine,
  IRtcEngine,
  ChannelProfileType,
  ClientRoleType,
} from 'react-native-agora';

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

class AgoraService {
  private engine: IRtcEngine | null = null;
  private isInitialized = false;
  private currentAppId: string | null = null;

  public async requestPermissions(callType: 'voice' | 'video'): Promise<PermissionCheckResult> {
    if (Platform.OS !== 'android') {
      return { granted: true, audioGranted: true, cameraGranted: true, bluetoothGranted: true };
    }

    try {
      const permissions: any[] = [
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      ];

      // Camera permission requested strictly for video calls
      if (callType === 'video') {
        permissions.push(PermissionsAndroid.PERMISSIONS.CAMERA);
      }

      // Android 12+ (API 31+) Bluetooth connect for headsets
      const isAndroid12OrHigher = typeof Platform.Version === 'number' && Platform.Version >= 31;
      if (isAndroid12OrHigher && PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT) {
        permissions.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
      }

      const results = await PermissionsAndroid.requestMultiple(permissions);

      const audioGranted =
        results[PermissionsAndroid.PERMISSIONS.RECORD_AUDIO] === PermissionsAndroid.RESULTS.GRANTED;

      const cameraGranted =
        callType === 'video'
          ? results[PermissionsAndroid.PERMISSIONS.CAMERA] === PermissionsAndroid.RESULTS.GRANTED
          : true;

      const bluetoothGranted =
        isAndroid12OrHigher && PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
          ? results[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED
          : true;

      if (!audioGranted) {
        return {
          granted: false,
          audioGranted: false,
          cameraGranted,
          bluetoothGranted,
          errorMessage: 'Microphone permission was denied. VibeChat requires microphone access to transmit your voice during calls. You can enable it in device Settings.',
        };
      }

      if (callType === 'video' && !cameraGranted) {
        return {
          granted: false,
          audioGranted: true,
          cameraGranted: false,
          bluetoothGranted,
          errorMessage: 'Camera permission was denied. VibeChat requires camera access to transmit video during video calls. You can enable it in device Settings.',
        };
      }

      return {
        granted: true,
        audioGranted,
        cameraGranted,
        bluetoothGranted,
      };
    } catch (error) {
      console.warn('Agora permissions request error:', error);
      return {
        granted: false,
        audioGranted: false,
        cameraGranted: false,
        bluetoothGranted: false,
        errorMessage: 'An unexpected error occurred while requesting device permissions for the call.',
      };
    }
  }

  public async initializeEngine(appId: string, callbacks: AgoraEventCallbacks): Promise<IRtcEngine | null> {
    if (Platform.OS === 'web') {
      console.warn('Agora Native SDK is not supported on Web.');
      return null;
    }

    try {
      if (this.engine && this.isInitialized && this.currentAppId === appId) {
        this.setupEventHandlers(callbacks);
        return this.engine;
      }

      if (this.engine) {
        this.release();
      }

      this.engine = createAgoraRtcEngine();
      this.engine.initialize({
        appId: appId.trim(),
        channelProfile: ChannelProfileType.ChannelProfileCommunication,
      });

      this.currentAppId = appId.trim();
      this.isInitialized = true;
      this.setupEventHandlers(callbacks);

      return this.engine;
    } catch (error) {
      console.error('Failed to initialize Agora RTC engine:', error);
      return null;
    }
  }

  private setupEventHandlers(callbacks: AgoraEventCallbacks) {
    if (!this.engine) return;

    this.engine.registerEventHandler({
      onJoinChannelSuccess: (connection, elapsed) => {
        callbacks.onJoinSuccess?.(connection.channelId || '', connection.localUid || 0);
      },
      onUserJoined: (_connection, uid) => {
        callbacks.onUserJoined?.(uid);
      },
      onUserOffline: (_connection, uid, _reason) => {
        callbacks.onUserOffline?.(uid);
      },
      onError: (err, msg) => {
        callbacks.onError?.(err, msg);
      },
    });
  }

  public async join(
    token: string,
    channelName: string,
    uid: number,
    callType: 'voice' | 'video'
  ): Promise<boolean> {
    if (!this.engine) {
      console.warn('Cannot join Agora channel: engine not initialized');
      return false;
    }

    try {
      // 1. Enable Audio module
      this.engine.enableAudio();
      this.engine.enableLocalAudio(true);

      // 2. Video module handling
      if (callType === 'video') {
        this.engine.enableVideo();
        this.engine.startPreview();
      } else {
        this.engine.disableVideo();
        this.engine.stopPreview();
      }

      // 3. Audio routing: default speakerphone for video, earpiece for voice
      this.engine.setEnableSpeakerphone(callType === 'video');

      // 4. Join channel
      const res = this.engine.joinChannel(
        token,
        channelName,
        uid,
        {
          clientRoleType: ClientRoleType.ClientRoleBroadcaster,
          autoSubscribeAudio: true,
          autoSubscribeVideo: callType === 'video',
          publishMicrophoneTrack: true,
          publishCameraTrack: callType === 'video',
        }
      );

      return res === 0;
    } catch (error) {
      console.error('Error joining Agora channel:', error);
      return false;
    }
  }

  public setMute(isMuted: boolean): void {
    if (!this.engine) return;
    try {
      this.engine.muteLocalAudioStream(isMuted);
    } catch (error) {
      console.warn('Failed to mute/unmute audio stream:', error);
    }
  }

  public setSpeaker(isSpeaker: boolean): void {
    if (!this.engine) return;
    try {
      this.engine.setEnableSpeakerphone(isSpeaker);
    } catch (error) {
      console.warn('Failed to toggle speakerphone:', error);
    }
  }

  public setVideoEnabled(isEnabled: boolean): void {
    if (!this.engine) return;
    try {
      this.engine.muteLocalVideoStream(!isEnabled);
      if (isEnabled) {
        this.engine.startPreview();
      } else {
        this.engine.stopPreview();
      }
    } catch (error) {
      console.warn('Failed to toggle video stream:', error);
    }
  }

  public switchCamera(): void {
    if (!this.engine) return;
    try {
      this.engine.switchCamera();
    } catch (error) {
      console.warn('Failed to switch camera:', error);
    }
  }

  public async leave(): Promise<void> {
    if (!this.engine) return;
    try {
      this.engine.stopPreview();
      this.engine.leaveChannel();
    } catch (error) {
      console.warn('Error leaving Agora channel:', error);
    }
  }

  public release(): void {
    if (!this.engine) return;
    try {
      this.engine.stopPreview();
      this.engine.leaveChannel();
      this.engine.release();
    } catch (error) {
      console.warn('Error releasing Agora engine:', error);
    } finally {
      this.engine = null;
      this.isInitialized = false;
      this.currentAppId = null;
    }
  }

  public getEngine(): IRtcEngine | null {
    return this.engine;
  }
}

export const agoraService = new AgoraService();
