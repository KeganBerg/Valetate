import { useMemo } from 'react';
import qrcode from 'qrcode-generator';

export function QrSvg({ text }: { text: string }) {
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 6, margin: 3, scalable: true });
  }, [text]);
  return <div className="qr" dangerouslySetInnerHTML={{ __html: svg }} />;
}
