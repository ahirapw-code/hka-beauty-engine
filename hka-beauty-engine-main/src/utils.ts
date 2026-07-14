export const formatIDR = (value: number): string => {
  return 'Rp ' + Math.round(value).toLocaleString('id-ID');
};
