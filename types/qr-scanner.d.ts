declare module "@yudiel/react-qr-scanner" {
  export interface IDetectedBarcode {
    rawValue: string;
    format?: string;
    cornerPoints?: Array<{ x: number; y: number }>;
  }

  export interface ScannerProps {
    onScan: (detectedCodes: IDetectedBarcode[]) => void;
    onError?: (error: unknown) => void;
    constraints?: MediaTrackConstraints;
    styles?: {
      container?: React.CSSProperties;
      video?: React.CSSProperties;
    };
    components?: {
      audio?: boolean;
      torch?: boolean;
      finder?: boolean;
    };
  }

  export const Scanner: React.FC<ScannerProps>;
}