"use client";

import { useParams } from "next/navigation";
import AssessmentForm from "../../AssessmentForm";

export default function EditAssessmentPage() {
  const params = useParams<{ customerId: string; assessmentId: string }>();
  return <AssessmentForm customerId={params.customerId} assessmentId={params.assessmentId} />;
}
