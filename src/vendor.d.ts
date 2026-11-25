declare module 'react-native-qrcode-svg/src/genMatrix' {
  export default function generateMatrix(value: string, errorCorrectionLevel?: string): boolean[][];
}

declare module 'react-native-qrcode-svg/src/transformMatrixIntoPath' {
  interface MatrixPath {
    cellSize: number;
    path: string;
  }
  export default function transformMatrixIntoPath(matrix: boolean[][], size: number): MatrixPath;
}
