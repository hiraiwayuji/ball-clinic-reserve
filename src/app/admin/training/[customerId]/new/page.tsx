"use client";

import { useParams } from "next/navigation";
import AssessmentForm from "../AssessmentForm";

export default function NewAssessmentPage() {
  const params = useParams<{ customerId: string }>();
  return <AssessmentForm customerId={params.customerId} />;
}
