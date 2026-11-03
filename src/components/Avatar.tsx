import React, { useState, useEffect, useRef } from "react";

interface AvatarProps {
  src?: string | null;
  name?: string;
  alt?: string;
  className?: string;
  sizeClassName?: string;
  roundedClassName?: string;
}

// Generate consistent background color based on name
function getAvatarColor(name: string = ""): string {
  const colors = [
    "bg-indigo-600 text-indigo-100",
    "bg-rose-600 text-rose-100",
    "bg-amber-600 text-amber-100",
    "bg-emerald-600 text-emerald-100",
    "bg-cyan-600 text-cyan-100",
    "bg-purple-600 text-purple-100",
    "bg-pink-600 text-pink-100",
    "bg-blue-600 text-blue-100",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name = "User",
  alt = "",
  className = "",
  sizeClassName = "w-9 h-9",
  roundedClassName = "rounded-full",
}) => {
  const [currentSrc, setCurrentSrc] = useState<string>("");
  const [hasError, setHasError] = useState<boolean>(false);
  const triedProxyRef = useRef<boolean>(false);
  const lastValidSrcRef = useRef<string>("");

  useEffect(() => {
    const raw = (src || "").trim();
    if (raw && (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("/api/"))) {
      const secureUrl = raw.startsWith("http://") ? raw.replace("http://", "https://") : raw;
      if (secureUrl !== currentSrc) {
        setCurrentSrc(secureUrl);
        triedProxyRef.current = false;
        setHasError(false);
      }
    } else if (!lastValidSrcRef.current) {
      setCurrentSrc("");
      setHasError(true);
    }
  }, [src]);

  const handleLoad = () => {
    if (currentSrc) {
      lastValidSrcRef.current = currentSrc;
      setHasError(false);
    }
  };

  const handleError = () => {
    // If we haven't tried the backend proxy yet for this source, try it now
    if (!triedProxyRef.current && currentSrc && !currentSrc.startsWith("/api/proxy/avatar")) {
      triedProxyRef.current = true;
      setCurrentSrc(`/api/proxy/avatar?url=${encodeURIComponent(currentSrc)}`);
      return;
    }

    // If proxy failed or currentSrc failed, but we previously had a working image, fall back to it
    if (lastValidSrcRef.current && currentSrc !== lastValidSrcRef.current) {
      setCurrentSrc(lastValidSrcRef.current);
      setHasError(false);
      return;
    }

    // Otherwise mark as error to display the initials fallback
    setHasError(true);
  };

  const initial = (name || "U").trim().charAt(0).toUpperCase() || "U";
  const colorClass = getAvatarColor(name);

  if (hasError || !currentSrc) {
    return (
      <div
        className={`${sizeClassName} ${roundedClassName} flex items-center justify-center font-bold text-xs shrink-0 select-none shadow-sm ${colorClass} ${className}`}
        title={name}
      >
        {initial}
      </div>
    );
  }

  return (
    <img
      src={currentSrc}
      alt={alt || name}
      onLoad={handleLoad}
      onError={handleError}
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
      className={`${sizeClassName} ${roundedClassName} object-cover shrink-0 select-none ${className}`}
    />
  );
};
