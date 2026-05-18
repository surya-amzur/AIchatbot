import { useEffect, useState, useRef } from "react";
import AppShell from "../components/layout/AppShell";
import { apiClient } from "../lib/api";

type FileItem = {
  name: string;
  url: string;
  type: "image" | "pdf" | "csv" | "txt" | "xlsx" | "other";
  size?: string;
};

function GalleryPage() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [brokenImages, setBrokenImages] = useState<Record<string, boolean>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const uploadBaseUrl = (apiClient.defaults.baseURL ?? "").replace(/\/$/, "");

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get("/api/uploads/list");
      const data = response.data;
      const parsedFiles = (data.files || []).map((file: string) => {
        // Extract filename after UUID prefix (if present)
        // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx_filename
        const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}_(.+)$/;
        const match = file.match(uuidPattern);
        const displayName = match ? match[1] : file;
        
        return {
          name: displayName,
          url: `${uploadBaseUrl}/uploads/${encodeURIComponent(file)}`,
          type: getFileType(file),
          size: "",
        };
      });
      setFiles(parsedFiles);
    } catch (error) {
      console.error("Failed to fetch files:", error);
    } finally {
      setLoading(false);
    }
  };

  const getFileType = (filename: string): FileItem["type"] => {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (["jpg", "jpeg", "png", "gif", "webp"].includes(ext || ""))
      return "image";
    if (ext === "pdf") return "pdf";
    if (ext === "csv") return "csv";
    if (ext === "txt") return "txt";
    if (ext === "xlsx") return "xlsx";
    return "other";
  };

  const getIcon = (type: FileItem["type"]) => {
    switch (type) {
      case "image":
        return "🖼️";
      case "pdf":
        return "📄";
      case "csv":
        return "📊";
      case "txt":
        return "📝";
      case "xlsx":
        return "📈";
      default:
        return "📎";
    }
  };

  const isImageFile = (type: FileItem["type"]) =>
    type === "image" || ["jpg", "jpeg", "png", "gif", "webp"].includes(
      type
    );

  return (
    <AppShell
      title="Gallery"
      subtitle="Your uploaded files and media"
    >
      <div ref={containerRef} className="h-full overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <svg
                className="animate-spin h-8 w-8 mx-auto mb-2 text-blue-600"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              <p className="text-slate-500 text-sm">Loading files...</p>
            </div>
          </div>
        ) : files.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <p className="text-slate-400 text-base">No files uploaded yet</p>
              <p className="text-slate-500 text-sm mt-1">
                Upload files from the chat panel to see them here
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Lightbox modal */}
            {selectedFile && isImageFile(selectedFile.type) && (
              <div
                className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
                onClick={() => setSelectedFile(null)}
              >
                <div
                  className="relative max-w-4xl max-h-[80vh]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => setSelectedFile(null)}
                    className="absolute -top-10 right-0 text-white text-2xl font-bold hover:opacity-75"
                  >
                    ✕
                  </button>
                  <img
                    src={selectedFile.url}
                    alt={selectedFile.name}
                    className="w-full h-full object-contain rounded-lg"
                  />
                  <p className="text-center text-white text-sm mt-4">
                    {selectedFile.name}
                  </p>
                </div>
              </div>
            )}

            {/* Grid of files */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 p-4">
              {files.map((file) => (
                <div
                  key={file.url}
                  className="group cursor-pointer"
                  onClick={() =>
                    isImageFile(file.type) && !brokenImages[file.url] && setSelectedFile(file)
                  }
                >
                  <div className="aspect-square rounded-lg border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center hover:bg-slate-100 transition-colors relative">
                    {file.type === "image" && !brokenImages[file.url] ? (
                      <img
                        src={file.url}
                        alt={file.name}
                        className="w-full h-full object-cover group-hover:opacity-75 transition-opacity"
                        onError={() =>
                          setBrokenImages((prev) => ({ ...prev, [file.url]: true }))
                        }
                      />
                    ) : (
                      <div className="text-center">
                        <div className="text-4xl">{getIcon(file.type)}</div>
                        <p className="mt-1 text-[10px] font-medium text-slate-500 uppercase">{file.type}</p>
                      </div>
                    )}
                    <div className="pointer-events-none absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg" />
                  </div>
                  <p className="text-xs text-slate-600 mt-2 truncate text-center hover:text-slate-900">
                    {file.name}
                  </p>
                  <a
                    href={file.url}
                    download
                    className="text-[10px] text-blue-600 hover:text-blue-800 text-center block mt-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Download
                  </a>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

export default GalleryPage;
