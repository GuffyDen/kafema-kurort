export type TableStandTemplateId = "table-stand-classic";

type TableStandRenderContext = {
  context: CanvasRenderingContext2D;
  qrImage: CanvasImageSource;
  storefrontUrl: string;
};

export type TableStandTemplate = {
  fileName: string;
  height: number;
  id: TableStandTemplateId;
  name: string;
  render: (renderContext: TableStandRenderContext) => void;
  width: number;
};

function drawRoundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - radius,
    y + height,
  );
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}

const classicTemplate: TableStandTemplate = {
  id: "table-stand-classic",
  name: "Классический",
  fileName: "table-stand-classic.png",
  width: 1240,
  height: 1754,
  render({ context, qrImage, storefrontUrl }) {
    context.fillStyle = "#F7F7F7";
    context.fillRect(0, 0, 1240, 1754);

    drawRoundedRect(context, 80, 80, 1080, 1594, 48);
    context.fillStyle = "#FFFFFF";
    context.fill();

    context.fillStyle = "#E30613";
    context.fillRect(80, 80, 1080, 18);

    context.textAlign = "center";
    context.fillStyle = "#1A1A1A";
    context.font = "700 76px Arial, sans-serif";
    context.fillText("Откройте меню", 620, 300);

    context.fillStyle = "#777777";
    context.font = "400 38px Arial, sans-serif";
    context.fillText("Наведите камеру телефона на QR-код", 620, 380);

    context.drawImage(qrImage, 250, 500, 740, 740);

    context.fillStyle = "#1A1A1A";
    context.font = "700 42px Arial, sans-serif";
    context.fillText("Выберите и закажите", 620, 1370);

    context.fillStyle = "#777777";
    context.font = "400 30px Arial, sans-serif";
    context.fillText(
      storefrontUrl.replace(/^https?:\/\//, "").replace(/\/$/, ""),
      620,
      1450,
    );
  },
};

export const tableStandTemplates: Record<
  TableStandTemplateId,
  TableStandTemplate
> = {
  "table-stand-classic": classicTemplate,
};

export const defaultTableStandTemplateId: TableStandTemplateId =
  "table-stand-classic";
