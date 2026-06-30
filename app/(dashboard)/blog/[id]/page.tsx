import { BlogEditor } from "./editor";

export default async function BlogEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BlogEditor id={id} />;
}
