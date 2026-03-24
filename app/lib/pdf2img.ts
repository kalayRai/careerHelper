export interface PdfConversionResult {
  imageUrl: string;
  file: File | null;
  error?: string;
}

let pdfjsLib: any = null;
let isLoading = false;
let loadPromise: Promise<any> | null = null;

async function loadPdfJs(): Promise<any> {
  if (pdfjsLib) return pdfjsLib;
  if (loadPromise) return loadPromise;

  isLoading = true;
  
  loadPromise = (async () => {
    try {
      // Try to load from CDN directly
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/build/pdf.min.js';
      await new Promise((resolve, reject) => {
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
      });
      
      // @ts-ignore
      const lib = window.pdfjsLib;
      
      // Set worker
      lib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@2.16.105/build/pdf.worker.min.js';
      
      pdfjsLib = lib;
      isLoading = false;
      return lib;
    } catch (err) {
      isLoading = false;
      console.error("Failed to load PDF.js:", err);
      throw new Error("PDF conversion library failed to load");
    }
  })();

  return loadPromise;
}

export async function convertPdfToImage(
  file: File
): Promise<PdfConversionResult> {
  try {
    console.log("Starting PDF conversion...");
    
    const lib = await loadPdfJs();
    console.log("PDF.js loaded successfully");
    
    const arrayBuffer = await file.arrayBuffer();
    console.log("File loaded, size:", arrayBuffer.byteLength);
    
    const pdf = await lib.getDocument({ data: arrayBuffer }).promise;
    console.log("PDF loaded, pages:", pdf.numPages);
    
    const page = await pdf.getPage(1);
    console.log("First page loaded");
    
    const viewport = page.getViewport({ scale: 2 }); // Reduced scale for better performance
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    if (!context) {
      throw new Error("Failed to get canvas context");
    }

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    await page.render({ canvasContext: context, viewport }).promise;
    console.log("Page rendered to canvas");

    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const originalName = file.name.replace(/\.pdf$/i, "");
            const imageFile = new File([blob], `${originalName}.png`, {
              type: "image/png",
            });

            resolve({
              imageUrl: URL.createObjectURL(blob),
              file: imageFile,
            });
          } else {
            resolve({
              imageUrl: "",
              file: null,
              error: "Failed to create image blob",
            });
          }
        },
        "image/png",
        0.9
      );
    });
  } catch (err) {
    console.error("PDF conversion error:", err);
    return {
      imageUrl: "",
      file: null,
      error: `Failed to convert PDF: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}