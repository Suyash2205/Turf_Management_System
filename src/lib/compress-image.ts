/** Compress large photos before upload (gallery images are often 5–10 MB). */
export async function compressImage(
  file: File,
  maxWidth = 1600,
  quality = 0.82
): Promise<File> {
  if (file.size < 400_000) return file;

  const objectUrl = URL.createObjectURL(file);

  try {
    const compressed = await new Promise<File>((resolve) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(file);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
            resolve(new File([blob], name, { type: "image/jpeg" }));
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => resolve(file);
      img.src = objectUrl;
    });

    return compressed.size < file.size ? compressed : file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
