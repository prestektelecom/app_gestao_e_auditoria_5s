import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { analyze, completedAuditsQuery, history, isOpen, isOverdue, ncAnswersQuery, plansQuery, recurrences, resolveRange, type Ctx, type Filters } from "./analytics";
import { sectorsQuery, settingsQuery, unitsQuery } from "./queries";

/** Loads aggregated audit data once and derives every dashboard indicator for the given filters. */
export function useAnalytics(f: Filters, opts: { historyMonths?: number } = {}) {
  const audits = useQuery(completedAuditsQuery);
  const answers = useQuery(ncAnswersQuery);
  const plans = useQuery(plansQuery);
  const units = useQuery(unitsQuery);
  const sectors = useQuery(sectorsQuery);
  const settings = useQuery(settingsQuery);
  const loading = audits.isLoading || answers.isLoading || units.isLoading || sectors.isLoading || settings.isLoading || plans.isLoading;

  const data = useMemo(() => {
    if (loading || !audits.data || !units.data || !sectors.data || !settings.data) return null;
    const ctx: Ctx = { audits: audits.data.audits, units: units.data, sectors: sectors.data, ncAnswers: answers.data ?? [] };
    const range = resolveRange(f);
    const cur = analyze(ctx, f, range.start, range.end);
    const prev = analyze(ctx, f, range.prev.start, range.prev.end);
    const prevSector = new Map(prev.sectorScores.map((s) => [s.sector_id, s.score]));
    const prevUnit = new Map(prev.unitScores.map((u) => [u.unit_id, u.score]));
    const scopedPlans = (plans.data ?? []).filter((p) => (!f.unit || p.unit_id === f.unit) && (!f.sector || p.sector_id === f.sector) && (!f.sense || p.sense === f.sense));
    const inProgress = audits.data.inProgress.filter((a) => (!f.unit || a.unit_id === f.unit) && (!f.sector || a.sector_id === f.sector) && (!f.auditor || a.auditor_id === f.auditor));
    return {
      ctx, range, cur, prev, prevSector, prevUnit, settings: settings.data, medals: settings.data.medals,
      history: history(ctx, f, range.end, opts.historyMonths ?? 6),
      recurrences: recurrences(ctx, f, range.start, range.end),
      plans: scopedPlans,
      openPlans: scopedPlans.filter((p) => isOpen(p) && !p.origin_changed),
      overduePlans: scopedPlans.filter(isOverdue),
      inProgress: inProgress.length,
    };
  }, [loading, audits.data, answers.data, plans.data, units.data, sectors.data, settings.data, f, opts.historyMonths]);

  return { loading, data };
}
