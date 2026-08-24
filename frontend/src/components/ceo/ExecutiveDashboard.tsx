import {
  Box,
  Grid,
} from "@mui/material";

import ExecutiveBoard from "./ExecutiveBoard";
import ExecutiveHealthCard from "./ExecutiveHealthCard";
import ExecutiveFinancialCard from "./ExecutiveFinancialCard";
import ExecutiveCashFlowCard from "./ExecutiveCashFlowCard";
import ExecutiveReceivablesCard from "./ExecutiveReceivablesCard";
import ExecutivePayablesCard from "./ExecutivePayablesCard";
import ExecutiveProductionCard from "./ExecutiveProductionCard";
import ExecutiveOccupancyCard from "./ExecutiveOccupancyCard";
import ExecutiveInventoryCard from "./ExecutiveInventoryCard";
import ExecutiveProfessionalRankingCard from "./ExecutiveProfessionalRankingCard";
import ExecutiveAIInsightsCard from "./ExecutiveAIInsightsCard";
import ExecutiveStrategicGoalsCard from "./ExecutiveStrategicGoalsCard";
import ExecutiveAlertsPanel from "./ExecutiveAlertsPanel";
import ExecutiveDRECard from "./ExecutiveDRECard";
import ExecutiveTaxPlanningCard from "./ExecutiveTaxPlanningCard";

export default function ExecutiveDashboard() {
  return (
    <Box sx={{ p: 3 }}>

      <ExecutiveBoard items={[]} />

      <Grid
        container
        spacing={3}
        sx={{ mt: 1 }}
      >

        <Grid size={{ xs: 12, md: 6 }}>
          <ExecutiveHealthCard
            financial={92}
            operational={88}
            commercial={79}
            clinical={95}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <ExecutiveFinancialCard
            revenue={0}
            expenses={0}
            profit={0}
            margin={0}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <ExecutiveCashFlowCard
            currentBalance={0}
            expectedIncome={0}
            expectedExpenses={0}
            projectedBalance={0}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <ExecutiveReceivablesCard
            totalReceivable={0}
            overdue={0}
            received={0}
            defaultRate={0}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <ExecutivePayablesCard
            totalPayable={0}
            overdue={0}
            paid={0}
            nextDue=""
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <ExecutiveProductionCard
            procedures={0}
            revenue={0}
            averageTicket={0}
            productionGoal={1}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <ExecutiveOccupancyCard
            occupancy={0}
            availableHours={0}
            bookedHours={0}
            idleHours={0}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <ExecutiveInventoryCard
            totalItems={0}
            lowStock={0}
            outOfStock={0}
            inventoryValue={0}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <ExecutiveProfessionalRankingCard
            professionals={[]}
          />
        </Grid>

        <Grid size={{ xs: 12 }}>
          <ExecutiveAIInsightsCard
            insights={[]}
          />
        </Grid>

        <Grid size={{ xs: 12 }}>
          <ExecutiveStrategicGoalsCard
            goals={[]}
          />
        </Grid>

        <Grid size={{ xs: 12 }}>
          <ExecutiveAlertsPanel
            alerts={[]}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <ExecutiveDRECard
            revenue={0}
            variableCosts={0}
            fixedCosts={0}
            taxes={0}
          />
        </Grid>

        <Grid size={{ xs: 12, md: 6 }}>
          <ExecutiveTaxPlanningCard
            estimatedTaxes={0}
            taxSavings={0}
            taxBurdenPercent={0}
            regime="Simples Nacional"
          />
        </Grid>

      </Grid>

    </Box>
  );
}
