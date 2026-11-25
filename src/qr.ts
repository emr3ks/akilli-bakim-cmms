import generateMatrix from 'react-native-qrcode-svg/src/genMatrix';
import transformMatrixIntoPath from 'react-native-qrcode-svg/src/transformMatrixIntoPath';

export function createQrSvg(value: string, size = 320): string {
  const matrix = generateMatrix(value, 'M');
  const { path, cellSize } = transformMatrixIntoPath(matrix, size);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    '<rect width="100%" height="100%" fill="#ffffff"/>',
    `<path d="${path}" fill="none" stroke="#10233f" stroke-width="${cellSize}" stroke-linecap="butt"/>`,
    '</svg>',
  ].join('');
}

export function createQrDataUri(value: string, size = 320): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(createQrSvg(value, size))}`;
}
