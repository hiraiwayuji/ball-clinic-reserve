import { createClient } from "@/lib/supabase/server";
import { checkAdminAuth } from "./auth";

type CustomerWithStats = {
  id: string;
  name: string;
  phone: string;
  created_at: string;
  appointmentCount: number;
  lastVisit: string | null;
};

export async function getCustomers(): Promise<CustomerWithStats[]> {
  await checkAdminAuth();
  try {
    const supabase = await createClient();

    // customersテーブルと、紐づくappointmentsを取得
    const { data: customers, error } = await supabase
      .from("customers")
      .select(`
        id,
        name,
        phone,
        created_at,
        appointments (
          id,
          start_time
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to fetch customers:", error);
      return [];
    }

    // 取得したデータから統計情報（予約回数、最終来院日）を計算して整形
    const formattedCustomers: CustomerWithStats[] = customers.map((c: any) => {
      const appointments = c.appointments || [];
      
      // start_timeでソートして最新の予約を取り出す（簡易的）
      let lastVisit = null;
      if (appointments.length > 0) {
        const sorted = [...appointments].sort((a, b) => 
          new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
        );
        lastVisit = sorted[0].start_time;
      }

      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        created_at: c.created_at,
        appointmentCount: appointments.length,
        lastVisit
      };
    });

    return formattedCustomers;
  } catch (err) {
    console.error("Customers fetch error:", err);
    return [];
  }
}
