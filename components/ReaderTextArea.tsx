import type React from 'react';

interface ReaderTextAreaProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
  onSelectionChange: () => void;
}

export const ReaderTextArea: React.FC<ReaderTextAreaProps> = ({
  textareaRef,
  value,
  onChange,
  onSelectionChange
}) => {
  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onSelect={onSelectionChange}
      onClick={onSelectionChange}
      onKeyUp={onSelectionChange}
      className="w-full h-full min-h-[50vh] bg-transparent border-0 resize-none focus:ring-0 text-lg leading-relaxed text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 selection:bg-blue-200 dark:selection:bg-blue-800"
      placeholder="在此粘贴文章，或点击相机上传图片..."
    />
  );
};
