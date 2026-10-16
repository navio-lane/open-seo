import { createFileRoute } from "@tanstack/react-router";
import { SeoIntelligencePage } from "@/client/features/seo-intelligence/SeoIntelligencePage";

export const Route = createFileRoute("/_app/p/$projectId/seo-intelligence")({
  component: SeoIntelligenceRoute,
});

function SeoIntelligenceRoute() {
  const { projectId } = Route.useParams();
  return <SeoIntelligencePage projectId={projectId} />;
}
