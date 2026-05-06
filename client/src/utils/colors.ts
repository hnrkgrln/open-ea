export const getContrastColor = (hex: string) => {
  if (!hex || !hex.startsWith('#')) return 'white';
  const hexCode = hex.replace('#', '');
  if (hexCode.length !== 6 && hexCode.length !== 3) return 'white';
  
  let r = 0, g = 0, b = 0;
  if (hexCode.length === 3) {
    r = parseInt(hexCode[0] + hexCode[0], 16);
    g = parseInt(hexCode[1] + hexCode[1], 16);
    b = parseInt(hexCode[2] + hexCode[2], 16);
  } else {
    r = parseInt(hexCode.substr(0, 2), 16);
    g = parseInt(hexCode.substr(2, 2), 16);
    b = parseInt(hexCode.substr(4, 2), 16);
  }
  const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return (yiq >= 128) ? '#000000' : '#ffffff';
};
