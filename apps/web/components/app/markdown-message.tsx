import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export function MarkdownMessage({ children }: { children: string }) {
  return (
    <div className="ac-prose max-w-none break-words text-[13px] leading-[1.5] [&_a]:underline [&_code]:rounded [&_code]:bg-app-panel-deep [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded-[8px] [&_pre]:bg-app-panel-deep [&_pre]:p-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_h1]:text-base [&_h1]:font-black [&_h2]:text-sm [&_h2]:font-extrabold">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
