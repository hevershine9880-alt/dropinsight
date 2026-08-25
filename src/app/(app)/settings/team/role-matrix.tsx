import { Card, CardHeader } from "@/components/ui/card";
import { ABILITIES, MATRIX_COLUMNS, ROLE_LABELS, ROLE_SUMMARIES, can } from "@/lib/auth/permissions";
import { Check, Minus } from "lucide-react";

/**
 * "What each role can do."
 *
 * Generated from `can()` — the same function the server calls on every page and
 * every mutation. The table therefore cannot drift away from what is actually
 * enforced, which is the whole reason it is worth showing.
 */
export function RoleMatrix() {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="What each role can do"
        description="Enforced on every page and every action — this table is generated from the same rules the server checks, so it is always the truth. Owners can do everything, including billing and this team."
      />

      <div className="table-scroll">
        <table className="w-full min-w-[40rem] text-left">
          <caption className="sr-only">Permissions granted by each role</caption>
          <thead>
            <tr className="border-y border-line bg-surface-sunken/50">
              <th scope="col" className="px-5 py-2.5 text-xs font-semibold text-ink-muted">Ability</th>
              {MATRIX_COLUMNS.map((role) => (
                <th key={role} scope="col" className="px-3 py-2.5 text-center text-xs font-semibold text-ink-muted">
                  {ROLE_LABELS[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {ABILITIES.map((ability) => (
              <tr key={ability.permission} className="transition-colors hover:bg-surface-hover">
                <th scope="row" className="px-5 py-2.5 text-left text-sm font-normal text-ink">
                  {ability.label}
                </th>
                {MATRIX_COLUMNS.map((role) => {
                  const allowed = can(role, ability.permission);
                  return (
                    <td key={role} className="px-3 py-2.5 text-center">
                      {allowed ? (
                        <Check className="mx-auto size-4 text-positive" aria-hidden />
                      ) : (
                        <Minus className="mx-auto size-4 text-ink-subtle" aria-hidden />
                      )}
                      <span className="sr-only">
                        {ROLE_LABELS[role]} {allowed ? "can" : "cannot"} {ability.label.toLowerCase()}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t border-line px-5 py-3">
        <dl className="grid gap-2 sm:grid-cols-2">
          {MATRIX_COLUMNS.map((role) => (
            <div key={role} className="text-sm">
              <dt className="font-medium text-ink">{ROLE_LABELS[role]}</dt>
              <dd className="text-ink-muted">{ROLE_SUMMARIES[role]}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Card>
  );
}
