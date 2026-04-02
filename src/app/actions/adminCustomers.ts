"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { checkAdminAuth } from "./auth";
import { revalidatePath } from "next/cache";

type CustomerWithStats = {
  id: string;
  name: string;
  phone: string;
  created_at: string;
  appointmentCount: number;
  cancelCount: number;
  lastVisit: string | null;
  booking_suspended: boolean;
};

export async function getCustomers(): Promise<CustomerWithStats[]> {
  await checkAdminAuth();
  try {
    const supabase = await createClient();

    const { data: customers, error } = await supabase
      .from("customers")
      .select(`
        id,
        name,
        phone,
        created_at,
        booking_suspended,
        appointments (
          id,
          start_time,
          status
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch customers:", error);
      return [];
    }

    const formattedCustomers: CustomerWithStats[] = customers.map((c: any) => {
      const appointments = c.appointments || [];
      const cancelled = appointments.filter((a: any) => a.status === "cancelled");
      const active = appointments.filter((a: any) => a.status !== "cancelled");

      let lastVisit = null;
      if (active.length > 0) {
        const sorted = [...active].sort((a, b) =>
          new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
        );
        lastVisit = sorted[0].start_time;
      }

      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        created_at: c.created_at,
        appointmentCount: active.length,
        cancelCount: cancelled.length,
        lastVisit,
        booking_suspended: c.booking_suspended ?? false,
      };
    });

    return formattedCustomers;
  } catch (err) {
    console.error("Customers fetch error:", err);
    return [];
  }
}

export async function toggleBookingSuspension(customerId: string, suspend: boolean) {
  await checkAdminAuth();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase env missing");

  const supabase = createAdminClient(url, key);
  const { error } = await supabase
    .from("customers")
    .update({ booking_suspended: suspend })
    .eq("id", customerId);

  if (error) throw new Error(error.message);
  revalidatePath("/admin/customers");
}
