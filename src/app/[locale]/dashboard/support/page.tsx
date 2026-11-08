import ArtCallout from "@/components/ArtCallout";
import SupportChat from "@/components/SupportChat";

export default function SupportPage() {
  return (
    <>
      <SupportChat />
      <ArtCallout className="mt-6 max-w-3xl" src="head-support" title="자주 묻는 질문부터 확인해 보세요" desc="많이 묻는 내용은 FAQ에 정리돼 있어요." href="/#faq" cta="FAQ 보기" />
    </>
  );
}
