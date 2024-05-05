import React, { useCallback, useEffect, useState } from "react";
import { FileRejection, useDropzone } from "react-dropzone";
import {
  ArrowUpTrayIcon,
  XMarkIcon,
  ArrowDownCircleIcon,
  TrashIcon,
} from "@heroicons/react/24/solid";
import AWS from "aws-sdk";
import toast, { Toaster } from "react-hot-toast";

interface DropzoneProps {
  className: string;
}

interface RejectedFile {
  file: File;
  errors: { code: string; message: string }[];
}

interface ExtendedFile extends File {
  preview: string;
}

AWS.config.update({
  accessKeyId: import.meta.env.VITE_APP_AWS_ACCESS_KEY_ID,
  secretAccessKey: import.meta.env.VITE_APP_AWS_SECRET_ACCESS_KEY,
  region: "us-east-1",
});

const Dropzone = ({ className }: DropzoneProps) => {
  const [files, setFiles] = useState<ExtendedFile[]>([]);
  const [rejected, setRejected] = useState<RejectedFile[]>([]);
  const [s3Links, setS3Links] = useState<string[]>([]);
  const [collagePreview, setCollagePreview] = useState<string>("");
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isGeneratingCollage, setIsGeneratingCollage] =
    useState<boolean>(false);

  const onDrop = useCallback(
    (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
      if (acceptedFiles?.length) {
        setFiles((previousFiles) => [
          ...previousFiles,
          ...acceptedFiles.map((file: ExtendedFile) =>
            Object.assign(file, { preview: URL.createObjectURL(file) })
          ),
        ]);
      }
      // console.log(files.map((file) => file.preview));

      // if (rejectedFiles?.length) {
      //   setRejected((previousFiles: RejectedFile[]) => [
      //     ...previousFiles,
      //     ...rejectedFiles,
      //   ]);
      //   console.log(rejectedFiles);
      // }

      if (rejectedFiles?.length) {
        setRejected((previousRejected) => [
          ...previousRejected,
          ...rejectedFiles.map(({ file, errors }) => ({
            file,
            errors: [
              {
                code: file.webkitRelativePath,
                message: errors.map((err) => err.message).join(", "),
              },
            ],
          })),
        ]);
      }
    },
    []
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      "image/*": [],
    },
    maxSize: 1024 * 1000,
    maxFiles: 9,
    onDrop,
  });

  useEffect(() => {
    // Revoke the data uris to avoid memory leaks
    return () =>
      files.forEach((file: ExtendedFile) => URL.revokeObjectURL(file.preview));
  }, [files]);

  const removeFile = (name: string) => {
    setFiles((files) => files.filter((file) => file.name !== name));
    setS3Links((links) =>
      links.filter((link) => {
        const fileNameFromLink = decodeURIComponent(
          link.split("/").pop() || ""
        );
        return fileNameFromLink !== name;
      })
    );
  };

  const removeAll = () => {
    setFiles([]);
    setRejected([]);
  };

  const removeRejected = (name: string) => {
    setRejected((rejected) =>
      rejected.filter((file) => file.file.name !== name)
    );
  };

  const uploadFilesToS3 = async () => {
    const s3 = new AWS.S3();
    const bucketName = "lolhaha";
    const uploadedFileNames = s3Links.map((link) => link.split("/").pop()); // Extract file names from S3 links

    try {
      // Filter out already uploaded files
      const newFiles = files.filter(
        (file) => !uploadedFileNames.includes(file.name)
      );

      const links = await Promise.all(
        newFiles.map(async (file) => {
          const params = {
            Bucket: bucketName,
            Key: file.name,
            Body: file,
          };
          const data = await s3.upload(params).promise();
          console.log(`File uploaded successfully: ${file.name}`);

          return data.Location;
        })
      );
      return links;
    } catch (error) {
      toast.error(error, {
        duration: 3000,
        position: "top-right",
        className: "bg-black text-white",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    try {
      setIsUploading(true);
      const links = await uploadFilesToS3();

      setIsUploading(false);
      if (links && links.length > 0) {
        setS3Links((prevLinks) => [...prevLinks, ...links]);
        toast.success("Files uploaded successfully", {
          duration: 3000,
          position: "top-right",
          className: "bg-black text-white",
        });
      } else {
        toast.error("No new files to upload", {
          duration: 3000,
          position: "top-right",
          className: "bg-black text-white",
        });
      }
    } catch (error) {
      console.error("Error uploading files:", error);
    }
  };

  const handleCollageSubmit = async (
    e: React.MouseEvent<HTMLButtonElement>
  ) => {
    e.preventDefault();
    setIsGeneratingCollage(true);
    setFiles([]);
    if (!s3Links.length) {
      return toast.error("No images to generate collage", {
        duration: 3000,
        position: "top-right",
        className: "bg-black text-white",
      });
    }

    // Create a canvas element
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    // Calculate the dimensions for the collage based on the number of files
    const numCols = Math.ceil(Math.sqrt(s3Links.length));
    const numRows = Math.ceil(s3Links.length / numCols);
    const canvasWidth = 200 * numCols;
    const canvasHeight = 200 * numRows;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // Load images onto the canvas
    let x = 0;
    let y = 0;
    for (let i = 0; i < s3Links.length; i++) {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.src = s3Links[i];
      await new Promise((resolve) => {
        image.onload = () => {
          ctx?.drawImage(image, x, y, 200, 200);
          x += 200;
          if (x >= canvasWidth) {
            x = 0;
            y += 200;
          }
          resolve(null);
        };
      });
    }

    // Convert the canvas to a data URL
    const collageDataUrl = canvas.toDataURL();
    setCollagePreview(collageDataUrl);
    toast.success("Collage generated successfully", {
      duration: 3000,
      position: "top-right",
      className: "bg-black text-white",
    });
    setIsGeneratingCollage(false);
    setS3Links([]);
  };

  const downloadCollage = () => {
    const a = document.createElement("a");
    a.href = collagePreview;
    a.download = "collage.png";
    a.click();
  };

  const clearCollage = () => {
    setCollagePreview("");
  };

  return (
    <>
      <Toaster />
      <form onSubmit={handleSubmit}>
        <div
          {...getRootProps({
            className: className,
          })}
        >
          <input {...getInputProps()} />
          <div className="flex flex-col items-center justify-center gap-4">
            <ArrowUpTrayIcon className="w-5 h-5 fill-current" />
            {isDragActive ? (
              <p>Drop the files here ...</p>
            ) : (
              <p>Drag & drop files here, or click to select files</p>
            )}
          </div>
        </div>
        <section className="mt-10">
          <div className="flex gap-4">
            {collagePreview && ( // Render collage preview if available
              <div>
                <h2 className="title text-2xl font-semibold">
                  Collage Preview
                </h2>
                <img
                  className="mt-6 flex items-center justify-center"
                  src={collagePreview}
                  alt="Collage Preview"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={downloadCollage}
                    className="bg-purple-500 mt-4 text-[12px] uppercase tracking-wider font-bold text-white rounded-md px-3 hover:bg-purple-600 hover:text-white transition-colors p-1 flex items-center justify-between gap-2"
                  >
                    Download{" "}
                    <ArrowDownCircleIcon className="w-4 h-4 fill-current" />
                  </button>
                  <button
                    type="button"
                    onClick={clearCollage}
                    className="bg-red-500 mt-4 text-[12px] uppercase tracking-wider font-bold text-white rounded-md px-3 hover:bg-red-600 hover:text-white transition-colors p-1 flex items-center justify-between gap-2"
                  >
                    Clear canvas <TrashIcon className="w-4 h-4 fill-current" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
        {/* Preview */}
        <section className="mt-10">
          <div className="flex justify-between gap-4">
            <h2 className="title text-2xl font-semibold">Preview</h2>
            <div className="flex gap-3">
              {files.length > 0 && (
                <button
                  type="button"
                  onClick={removeAll}
                  className="bg-red-500 mt-1 text-[12px] uppercase tracking-wider font-bold text-white rounded-md px-3 hover:bg-red-600 transition-colors"
                >
                  Remove all
                </button>
              )}

              {files.length > 0 && (
                <button
                  type="submit"
                  disabled={isUploading}
                  className={`ml-auto mt-1 text-[12px] uppercase tracking-wider font-bold text-neutral-500 border border-purple-400 rounded-md px-3 hover:bg-purple-400 hover:text-white transition-colors ${
                    isUploading ? "bg-purple-400 text-white" : ""
                  }`}
                >
                  {isUploading ? (
                    <span className="flex items-center justify-between gap-2">
                      {" "}
                      <i className="fa-solid fa-spinner  fill-current animate-spin"></i>
                      Uploading...
                    </span>
                  ) : (
                    <span>Upload Files</span>
                  )}
                </button>
              )}

              {s3Links.length > 0 && (
                <button
                  type="button"
                  onClick={handleCollageSubmit}
                  className="ml-auto mt-1 text-[12px] uppercase tracking-wider font-bold text-neutral-500 border border-purple-400 rounded-md px-3 hover:bg-purple-400 hover:text-white transition-colors"
                >
                  {isGeneratingCollage ? (
                    <span className="flex items-center justify-between gap-2">
                      {" "}
                      <i className="fa-solid fa-spinner  fill-current animate-spin"></i>
                      Generating...
                    </span>
                  ) : (
                    <span>Generate Collage</span>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Accepted files */}
          <h3 className="title text-base font-semibold text-neutral-600 mt-10 border-b pb-3">
            Accepted Files ({files.length})
          </h3>
          <ul className="mt-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-10">
            {files.map((file: ExtendedFile) => (
              <li
                key={file.name}
                className="relative h-32 rounded-md shadow-lg"
              >
                <img
                  src={file.preview}
                  alt={file.name}
                  onLoad={() => {
                    URL.revokeObjectURL(file.preview);
                  }}
                  className="h-full w-full object-contain rounded-md"
                />
                <button
                  type="button"
                  className="w-7 h-7 bg-red-500 rounded-full flex justify-center items-center absolute -top-3 -right-3 hover:bg-red-600 transition-colors"
                  onClick={() => removeFile(file.name)}
                >
                  <XMarkIcon className="w-5 h-5 fill-white transition-colors" />
                </button>
                <p className="mt-2 text-neutral-500 text-[12px] font-medium">
                  {file.name}
                </p>
              </li>
            ))}
          </ul>

          {/* Rejected Files */}
          <h3 className="title text-md font-semibold text-neutral-600 mt-24 border-b pb-3">
            Rejected Files ({rejected.length})
          </h3>
          <ul className="mt-6 flex flex-col">
            {rejected.map(({ file, errors }) => (
              <li key={file.name} className="flex items-start justify-between">
                <div>
                  <p className="mt-2 text-neutral-500 text-sm font-medium">
                    {file.name}
                  </p>
                  <ul className="text-[12px] text-red-400">
                    {errors.map((error) => (
                      <li key={error.code}>{error.message}</li>
                    ))}
                  </ul>
                </div>
                <button
                  type="button"
                  className="bg-red-500 mt-1 py-1 text-[12px] uppercase tracking-wider font-bold text-white rounded-md px-3 hover:bg-red-600 hover:text-white transition-colors"
                  onClick={() => removeRejected(file.name)}
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      </form>
    </>
  );
};

export default Dropzone;
