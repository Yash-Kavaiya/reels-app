import { ReelList } from "@/components/ReelList";
import { Uploader } from "@/components/Uploader";

export default function Home() {
  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="text-3xl font-bold text-slate-900">Turn a video into a Reel or Short</h1>
      <p className="mb-8 mt-2 max-w-2xl text-slate-700">
        Add a recording and get back a finished vertical video: cropped to 9:16, captioned from the
        speech in English, Hindi or Gujarati, with a headline and closing call to action. You can
        correct anything afterwards.
      </p>
      <Uploader />
      <ReelList />
    </div>
  );
}
