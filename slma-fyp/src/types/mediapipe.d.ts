// Global TypeScript declarations for MediaPipe CDN-loaded libraries
// These are exposed on window when scripts are loaded via <script> tags

export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface Connection {
  start: number;
  end: number;
}

export interface DrawingStyle {
  color?: string;
  lineWidth?: number;
  radius?: number;
  fillColor?: string;
  visibilityMin?: number;
}

export interface HolisticConfig {
  locateFile?: (file: string) => string;
}

export interface HolisticOptions {
  modelComplexity?: 0 | 1 | 2;
  smoothLandmarks?: boolean;
  enableSegmentation?: boolean;
  smoothSegmentation?: boolean;
  refineFaceLandmarks?: boolean;
  minDetectionConfidence?: number;
  minTrackingConfidence?: number;
}

export interface HolisticResults {
  image: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;
  poseLandmarks?: NormalizedLandmark[];
  faceLandmarks?: NormalizedLandmark[];
  leftHandLandmarks?: NormalizedLandmark[];
  rightHandLandmarks?: NormalizedLandmark[];
  poseWorldLandmarks?: NormalizedLandmark[];
  segmentationMask?: ImageData;
}

export interface HolisticInstance {
  setOptions(options: HolisticOptions): void;
  onResults(callback: (results: HolisticResults) => void): void;
  send(inputs: { image: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement }): Promise<void>;
  close(): void;
}

export interface CameraOptions {
  onFrame: () => Promise<void>;
  width?: number;
  height?: number;
  facingMode?: string;
}

export interface CameraInstance {
  start(): Promise<void>;
  stop(): void;
}

declare global {
  interface Window {
    // Holistic constructor
    Holistic: new (config?: HolisticConfig) => HolisticInstance;
    // Camera constructor
    Camera: new (videoElement: HTMLVideoElement, options: CameraOptions) => CameraInstance;
    // Drawing utilities
    drawConnectors: (
      canvasCtx: CanvasRenderingContext2D,
      landmarks: NormalizedLandmark[] | undefined,
      connections: Connection[],
      style?: DrawingStyle
    ) => void;
    drawLandmarks: (
      canvasCtx: CanvasRenderingContext2D,
      landmarks: NormalizedLandmark[] | undefined,
      style?: DrawingStyle
    ) => void;
    // Connections constants
    HAND_CONNECTIONS: Connection[];
    POSE_CONNECTIONS: Connection[];
    FACEMESH_TESSELATION: Connection[];
    FACEMESH_RIGHT_EYE: Connection[];
    FACEMESH_LEFT_EYE: Connection[];
    FACEMESH_RIGHT_EYEBROW: Connection[];
    FACEMESH_LEFT_EYEBROW: Connection[];
    FACEMESH_FACE_OVAL: Connection[];
    FACEMESH_LIPS: Connection[];
    FACEMESH_CONTOURS: Connection[];
  }
}
