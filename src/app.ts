import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';

const STORAGE_KEY = 'goal-tracker-v1';
const GOAL_WEIGHT_LBS = 170;
const CHART_DAYS = 30;

type ISODate = string;
type YesNo = 'yes' | 'no' | null;

type DietKey =
    | 'nonKetoFruits'
    | 'highCarbDairy'
    | 'processedFoods'
    | 'starchyVeggies'
    | 'refinedCarbs';

const DIET_RULES: Array<{ key: DietKey; label: string; helper?: string }> = [
    {
        key: 'nonKetoFruits',
        label: 'Did you eat any non-keto fruits?',
    },
    {
        key: 'highCarbDairy',
        label: 'Did you eat any high-carb dairy?',
    },
    {
        key: 'processedFoods',
        label: 'Did you eat any processed foods, including keto versions?',
    },
    {
        key: 'starchyVeggies',
        label: 'Did you eat more than small amounts of starchy vegetables?',
    },
    {
        key: 'refinedCarbs',
        label: 'Did you eat any refined carbohydrates?',
    },
];

interface DietChecks extends Record<DietKey, YesNo> {}

interface DayRecord {
    date: ISODate;
    diet: DietChecks;
    dietException: YesNo;
    dessertPass: YesNo;
    mealPass: YesNo;
    weightMorning?: number;
    weightNight?: number;
    weightMorningMissed: boolean;
    weightNightMissed: boolean;
    weightLiftingDone: YesNo;
    waterFastDone: YesNo;
}

interface WeekPlan {
    dates: ISODate[];
}

interface FastPlan {
    dates: ISODate[];
}

interface AppState {
    days: Record<ISODate, DayRecord>;
    weekPlans: Record<string, WeekPlan>;
    fastPlans: Record<string, FastPlan>;
    trackingStart: ISODate;
    confirmedWeeks: Record<string, boolean>;
    confirmedMonths: Record<string, boolean>;
}

type BlockingOverlay =
    | { type: 'month'; monthKey: string }
    | { type: 'week'; weekKey: string }
    | { type: 'yesterday'; date: ISODate };

const emptyDiet = (): DietChecks => ({
    nonKetoFruits: null,
    highCarbDairy: null,
    processedFoods: null,
    starchyVeggies: null,
    refinedCarbs: null,
});

const createEmptyDay = (date: ISODate): DayRecord => ({
    date,
    diet: emptyDiet(),
    dietException: null,
    dessertPass: null,
    mealPass: null,
    weightMorning: undefined,
    weightNight: undefined,
    weightMorningMissed: false,
    weightNightMissed: false,
    weightLiftingDone: null,
    waterFastDone: null,
});

const defaultState = (): AppState => ({
    days: {},
    weekPlans: {},
    fastPlans: {},
    trackingStart: formatDate(new Date()),
    confirmedWeeks: {},
    confirmedMonths: {},
});

const pad = (value: number) => String(value).padStart(2, '0');

const formatDate = (date: Date): ISODate => {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const parseDate = (value: ISODate): Date => {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
};

const addDays = (date: Date, amount: number): Date => {
    return new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate() + amount,
    );
};

const getWeekStart = (date: Date): Date => {
    const day = date.getDay();
    const diff = -day;
    return addDays(date, diff);
};

const getWeekKey = (date: Date): string => formatDate(getWeekStart(date));

const getMonthKey = (date: Date): string => {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
};

const getDaysInMonth = (year: number, monthIndex: number): number => {
    return new Date(year, monthIndex + 1, 0).getDate();
};

const loadState = (): AppState => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
        return defaultState();
    }
    try {
        const parsed = JSON.parse(raw) as Partial<AppState>;
        return {
            days: parsed.days ?? {},
            weekPlans: parsed.weekPlans ?? {},
            fastPlans: parsed.fastPlans ?? {},
            trackingStart: parsed.trackingStart ?? formatDate(new Date()),
            confirmedWeeks: parsed.confirmedWeeks ?? {},
            confirmedMonths: parsed.confirmedMonths ?? {},
        };
    } catch {
        return defaultState();
    }
};

const saveState = (state: AppState) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

const formatDisplayDate = (value: ISODate): string => {
    const parts = new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    }).formatToParts(parseDate(value));
    const lookup = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((part) => part.type === type)?.value ?? '';
    const weekday = lookup('weekday');
    const month = lookup('month');
    const day = lookup('day');
    return `${weekday} ${month} ${day}`.trim();
};

const formatDisplayLong = (value: ISODate): string => {
    return new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    }).format(parseDate(value));
};

const formatMonthLabel = (monthKey: string): string => {
    const [year, month] = monthKey.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US', {
        month: 'long',
        year: 'numeric',
    }).format(new Date(year, month - 1, 1));
};

const buildDateRange = (endDate: Date, days: number): ISODate[] => {
    return Array.from({ length: days }, (_, index) =>
        formatDate(addDays(endDate, index - (days - 1))),
    );
};

@customElement('goal-tracker-app')
export class GoalTrackerApp extends LitElement {
    @state()
    private appState: AppState = loadState();

    @state()
    private selectedDate: ISODate = formatDate(new Date());

    @state()
    private weekFocus: ISODate = getWeekKey(new Date());

    @state()
    private monthFocus: string = getMonthKey(new Date());

    connectedCallback() {
        super.connectedCallback();
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            saveState(this.appState);
            return;
        }
        try {
            const parsed = JSON.parse(raw) as Partial<AppState>;
            if (!parsed.trackingStart) {
                saveState(this.appState);
            }
        } catch {
            saveState(this.appState);
        }
    }

    createRenderRoot() {
        return this;
    }

    private getDay(date: ISODate): DayRecord {
        const stored = this.appState.days[date];
        if (!stored) {
            return createEmptyDay(date);
        }
        return {
            ...createEmptyDay(date),
            ...stored,
            diet: {
                ...emptyDiet(),
                ...stored.diet,
            },
        };
    }

    private setState(nextState: AppState) {
        this.appState = nextState;
        saveState(nextState);
    }

    private updateDay(date: ISODate, updater: (day: DayRecord) => DayRecord) {
        const current = this.appState.days[date] ?? createEmptyDay(date);
        const updated = updater(current);
        this.setState({
            ...this.appState,
            days: {
                ...this.appState.days,
                [date]: updated,
            },
        });
    }

    private updateWeekPlan(weekKey: string, dates: ISODate[]) {
        this.setState({
            ...this.appState,
            weekPlans: {
                ...this.appState.weekPlans,
                [weekKey]: { dates },
            },
            confirmedWeeks: {
                ...this.appState.confirmedWeeks,
                [weekKey]: false,
            },
        });
    }

    private updateFastPlan(monthKey: string, dates: ISODate[]) {
        this.setState({
            ...this.appState,
            fastPlans: {
                ...this.appState.fastPlans,
                [monthKey]: { dates },
            },
            confirmedMonths: {
                ...this.appState.confirmedMonths,
                [monthKey]: false,
            },
        });
    }

    private confirmWeekPlan(weekKey: string) {
        this.setState({
            ...this.appState,
            confirmedWeeks: {
                ...this.appState.confirmedWeeks,
                [weekKey]: true,
            },
        });
    }

    private confirmMonthPlan(monthKey: string) {
        this.setState({
            ...this.appState,
            confirmedMonths: {
                ...this.appState.confirmedMonths,
                [monthKey]: true,
            },
        });
    }

    private toggleYesNo(value: YesNo, next: 'yes' | 'no'): YesNo {
        return value === next ? null : next;
    }

    private setDietValue(date: ISODate, key: DietKey, value: YesNo) {
        this.updateDay(date, (day) => ({
            ...day,
            diet: {
                ...day.diet,
                [key]: value,
            },
        }));
    }

    private setDayValue(
        date: ISODate,
        key: keyof Omit<DayRecord, 'diet' | 'date'>,
        value: YesNo | number | undefined,
    ) {
        this.updateDay(date, (day) => ({
            ...day,
            [key]: value,
        }));
    }

    private setWeightValue(
        date: ISODate,
        key: 'weightMorning' | 'weightNight',
        value: number | undefined,
    ) {
        const missedKey =
            key === 'weightMorning'
                ? 'weightMorningMissed'
                : 'weightNightMissed';
        this.updateDay(date, (day) => ({
            ...day,
            [key]: value,
            [missedKey]: value !== undefined ? false : day[missedKey],
        }));
    }

    private toggleWeightMissed(
        date: ISODate,
        key: 'weightMorning' | 'weightNight',
    ) {
        const missedKey =
            key === 'weightMorning'
                ? 'weightMorningMissed'
                : 'weightNightMissed';
        this.updateDay(date, (day) => {
            const nextMissed = !day[missedKey];
            return {
                ...day,
                [missedKey]: nextMissed,
                [key]: nextMissed ? undefined : day[key],
            };
        });
    }

    private dietRulesAnswered(day: DayRecord): boolean {
        return DIET_RULES.every((rule) => day.diet[rule.key] !== null);
    }

    private dietRulesAllClear(day: DayRecord): boolean {
        return DIET_RULES.every((rule) => day.diet[rule.key] === 'no');
    }

    private dietRequirementSatisfied(day: DayRecord): boolean {
        return (
            day.dietException === 'yes' ||
            day.dessertPass === 'yes' ||
            day.mealPass === 'yes' ||
            this.dietRulesAllClear(day)
        );
    }

    private isLiftingDay(date: ISODate): boolean {
        const weekKey = getWeekKey(parseDate(date));
        const plan = this.appState.weekPlans[weekKey];
        return plan ? plan.dates.includes(date) : false;
    }

    private isFastDay(date: ISODate): boolean {
        const monthKey = getMonthKey(parseDate(date));
        const plan = this.appState.fastPlans[monthKey];
        return plan ? plan.dates.includes(date) : false;
    }

    private isDayComplete(day: DayRecord, date: ISODate): boolean {
        const dietExceptionSet = day.dietException !== null;
        const dietNeedsRules = day.dietException !== 'yes';
        const dietRulesComplete =
            !dietNeedsRules || this.dietRulesAnswered(day);
        const passesAnswered =
            !dietNeedsRules ||
            (day.dessertPass !== null && day.mealPass !== null);
        const dietSectionComplete =
            dietExceptionSet && dietRulesComplete && passesAnswered;

        const weightMorningSet =
            Number.isFinite(day.weightMorning) || day.weightMorningMissed;
        const weightNightSet =
            Number.isFinite(day.weightNight) || day.weightNightMissed;
        const weightsComplete = weightMorningSet && weightNightSet;

        const liftingRequired = this.isLiftingDay(date);
        const liftingComplete =
            !liftingRequired || day.weightLiftingDone !== null;

        const fastRequired = this.isFastDay(date);
        const fastComplete = !fastRequired || day.waterFastDone !== null;

        return (
            dietSectionComplete &&
            weightsComplete &&
            liftingComplete &&
            fastComplete
        );
    }

    private isWeekPlanComplete(weekKey: string): boolean {
        const plan = this.appState.weekPlans[weekKey];
        return plan?.dates.length === 3;
    }

    private isWeekPlanConfirmed(weekKey: string): boolean {
        return Boolean(this.appState.confirmedWeeks[weekKey]);
    }

    private isMonthPlanComplete(monthKey: string): boolean {
        const plan = this.appState.fastPlans[monthKey];
        return plan?.dates.length === 3;
    }

    private isMonthPlanConfirmed(monthKey: string): boolean {
        return Boolean(this.appState.confirmedMonths[monthKey]);
    }

    private getBlockingOverlay(): BlockingOverlay | null {
        const today = new Date();
        const currentMonthKey = getMonthKey(today);
        if (
            !this.isMonthPlanComplete(currentMonthKey) ||
            !this.isMonthPlanConfirmed(currentMonthKey)
        ) {
            return { type: 'month', monthKey: currentMonthKey };
        }

        const currentWeekKey = getWeekKey(today);
        if (
            !this.isWeekPlanComplete(currentWeekKey) ||
            !this.isWeekPlanConfirmed(currentWeekKey)
        ) {
            return { type: 'week', weekKey: currentWeekKey };
        }

        const yesterday = formatDate(addDays(today, -1));
        if (parseDate(yesterday) < parseDate(this.appState.trackingStart)) {
            return null;
        }
        const day = this.getDay(yesterday);
        return this.isDayComplete(day, yesterday)
            ? null
            : { type: 'yesterday', date: yesterday };
    }

    private getPassConflict(
        date: ISODate,
        key: 'dessertPass' | 'mealPass',
    ): ISODate | null {
        const weekKey = getWeekKey(parseDate(date));
        const planDates = Object.keys(this.appState.days);
        for (const dayKey of planDates) {
            if (dayKey === date) continue;
            if (getWeekKey(parseDate(dayKey)) !== weekKey) continue;
            if (this.appState.days[dayKey]?.[key] === 'yes') {
                return dayKey;
            }
        }
        return null;
    }

    private getDailyAverage(day: DayRecord): number | null {
        const morning = day.weightMorning;
        const night = day.weightNight;
        if (Number.isFinite(morning) && Number.isFinite(night)) {
            return ((morning ?? 0) + (night ?? 0)) / 2;
        }
        if (Number.isFinite(morning)) return morning ?? null;
        if (Number.isFinite(night)) return night ?? null;
        return null;
    }

    private getWeightSeries(): Array<{ date: ISODate; value: number }> {
        const entries = Object.values(this.appState.days)
            .map((day) => ({
                date: day.date,
                value: this.getDailyAverage(day),
            }))
            .filter((entry): entry is { date: ISODate; value: number } =>
                Number.isFinite(entry.value),
            )
            .sort((a, b) => a.date.localeCompare(b.date));
        return entries;
    }

    private getRollingAverage(
        currentDate: ISODate,
        windowSize: number,
    ): number | null {
        const endDate = parseDate(currentDate);
        const range = buildDateRange(endDate, windowSize);
        const values = range
            .map((date) => this.getDailyAverage(this.getDay(date)))
            .filter((value): value is number => Number.isFinite(value));
        if (!values.length) return null;
        return values.reduce((sum, value) => sum + value, 0) / values.length;
    }

    private renderYesNo(
        label: string,
        value: YesNo,
        onChange: (value: YesNo) => void,
        helper?: string,
    ) {
        return html`
            <div class="yesno">
                <div class="yesno-label">
                    <div class="label-main">${label}</div>
                    ${helper
                        ? html`<div class="label-helper">${helper}</div>`
                        : null}
                </div>
                <div class="yesno-buttons" role="group" aria-label=${label}>
                    <button
                        class="pill ${value === 'yes' ? 'active yes' : ''}"
                        type="button"
                        @click=${() => onChange(this.toggleYesNo(value, 'yes'))}
                    >
                        Yes
                    </button>
                    <button
                        class="pill ${value === 'no' ? 'active no' : ''}"
                        type="button"
                        @click=${() => onChange(this.toggleYesNo(value, 'no'))}
                    >
                        No
                    </button>
                </div>
            </div>
        `;
    }

    private renderWeightInput(
        label: string,
        value: number | undefined,
        missed: boolean,
        onChange: (value: number | undefined) => void,
        onMissedToggle: () => void,
    ) {
        return html`
            <div class="weight-field">
                <label class="weight-input">
                    <span>${label}</span>
                    <input
                        type="number"
                        step="0.1"
                        inputmode="decimal"
                        placeholder="lbs"
                        .value=${value === undefined ? '' : String(value)}
                        ?disabled=${missed}
                        @input=${(event: Event) => {
                            const target = event.target as HTMLInputElement;
                            const next =
                                target.value.trim() === ''
                                    ? undefined
                                    : Number(target.value);
                            onChange(Number.isFinite(next) ? next : undefined);
                        }}
                    />
                </label>
                <button
                    class="pill missed ${missed ? 'active' : ''}"
                    type="button"
                    @click=${onMissedToggle}
                >
                    ${missed ? 'Missed' : 'Mark missed'}
                </button>
            </div>
        `;
    }

    private renderDietSection(day: DayRecord, date: ISODate) {
        const dietRulesAllClear = this.dietRulesAllClear(day);
        const dessertConflict =
            day.dessertPass === 'yes'
                ? this.getPassConflict(date, 'dessertPass')
                : null;
        const mealConflict =
            day.mealPass === 'yes'
                ? this.getPassConflict(date, 'mealPass')
                : null;

        return html`
            <div class="card inset">
                <div class="section-header">
                    <div>
                        <h3>Diet plan</h3>
                        <p class="subtle">
                            Base diet: meat, cheese, nuts, keto fruits
                            (strawberries, blackberries, raspberries), low carb
                            dairy like heavy cream (no milk), non-starchy
                            vegetables, and small amounts of starchy vegetables.
                            Avoid processed keto products. Answer yes if you ate
                            any of the items below.
                        </p>
                    </div>
                    <label class="computed">
                        <input
                            type="checkbox"
                            disabled
                            .checked=${dietRulesAllClear}
                        />
                        Followed diet rules
                    </label>
                </div>
                ${this.renderYesNo(
                    'Did you use the diet exception (friends/family outside wife, dog, work teammates)?',
                    day.dietException,
                    (value) => this.setDayValue(date, 'dietException', value),
                )}
                ${this.renderYesNo(
                    'Did you use a dessert pass today (1 per week)?',
                    day.dessertPass,
                    (value) => this.setDayValue(date, 'dessertPass', value),
                )}
                ${this.renderYesNo(
                    'Did you use a meal pass today (1 per week)?',
                    day.mealPass,
                    (value) => this.setDayValue(date, 'mealPass', value),
                )}
                ${dessertConflict
                    ? html`<div class="warning">
                          Dessert pass already used this week on
                          ${formatDisplayDate(dessertConflict)}.
                      </div>`
                    : null}
                ${mealConflict
                    ? html`<div class="warning">
                          Meal pass already used this week on
                          ${formatDisplayDate(mealConflict)}.
                      </div>`
                    : null}
                <div class="rules-grid">
                    ${DIET_RULES.map((rule) =>
                        this.renderYesNo(
                            rule.label,
                            day.diet[rule.key],
                            (value) => this.setDietValue(date, rule.key, value),
                        ),
                    )}
                </div>
            </div>
        `;
    }

    private renderWeightSection(day: DayRecord, date: ISODate) {
        return html`
            <div class="card inset">
                <div class="section-header">
                    <div>
                        <h3>Weight check-in</h3>
                        <p class="subtle">Morning and night weigh-ins.</p>
                    </div>
                </div>
                <div class="weights">
                    ${this.renderWeightInput(
                        'Morning',
                        day.weightMorning,
                        day.weightMorningMissed,
                        (value) =>
                            this.setWeightValue(date, 'weightMorning', value),
                        () => this.toggleWeightMissed(date, 'weightMorning'),
                    )}
                    ${this.renderWeightInput(
                        'Night',
                        day.weightNight,
                        day.weightNightMissed,
                        (value) =>
                            this.setWeightValue(date, 'weightNight', value),
                        () => this.toggleWeightMissed(date, 'weightNight'),
                    )}
                </div>
            </div>
        `;
    }

    private renderLiftingSection(day: DayRecord, date: ISODate) {
        if (!this.isLiftingDay(date)) {
            return html`
                <div class="card inset">
                    <div class="section-header">
                        <div>
                            <h3>Weight lifting</h3>
                            <p class="subtle">
                                No lifting planned for this day.
                            </p>
                        </div>
                    </div>
                </div>
            `;
        }

        return html`
            <div class="card inset">
                <div class="section-header">
                    <div>
                        <h3>Weight lifting</h3>
                        <p class="subtle">
                            Planned day. Did you do 30+ minutes?
                        </p>
                    </div>
                </div>
                ${this.renderYesNo(
                    '30+ minutes completed',
                    day.weightLiftingDone,
                    (value) =>
                        this.setDayValue(date, 'weightLiftingDone', value),
                )}
            </div>
        `;
    }

    private renderFastSection(day: DayRecord, date: ISODate) {
        if (!this.isFastDay(date)) {
            return html`
                <div class="card inset">
                    <div class="section-header">
                        <div>
                            <h3>Water-only fast</h3>
                            <p class="subtle">
                                No fast scheduled for this day.
                            </p>
                        </div>
                    </div>
                </div>
            `;
        }

        return html`
            <div class="card inset">
                <div class="section-header">
                    <div>
                        <h3>Water-only fast</h3>
                        <p class="subtle">
                            Scheduled fast day. Did you complete it?
                        </p>
                    </div>
                </div>
                ${this.renderYesNo(
                    'Completed fast for this day',
                    day.waterFastDone,
                    (value) => this.setDayValue(date, 'waterFastDone', value),
                )}
            </div>
        `;
    }

    private renderDailyChecklist(date: ISODate) {
        const day = this.getDay(date);
        const complete = this.isDayComplete(day, date);

        return html`
            <div class="daily-header">
                <div>
                    <div class="title">${formatDisplayLong(date)}</div>
                    <div class="subtle">Daily checkboxes and inputs.</div>
                </div>
                <div class="status ${complete ? 'complete' : 'pending'}">
                    ${complete ? 'Complete' : 'Incomplete'}
                </div>
            </div>
            <div class="daily-grid">
                ${this.renderDietSection(day, date)}
                ${this.renderWeightSection(day, date)}
                ${this.renderLiftingSection(day, date)}
                ${this.renderFastSection(day, date)}
            </div>
        `;
    }

    private renderWeightProgress() {
        const weightSeries = this.getWeightSeries();
        const currentDate = formatDate(new Date());
        const currentAvg = this.getRollingAverage(currentDate, 7);
        const startWeight = weightSeries.length ? weightSeries[0].value : null;

        if (currentAvg === null || startWeight === null) {
            return html`
                <div class="progress-card">
                    <div class="progress-title">
                        Weight goal: ${GOAL_WEIGHT_LBS} lbs
                    </div>
                    <div class="progress-subtle">
                        Log your first weigh-in to start tracking progress.
                    </div>
                </div>
            `;
        }

        const totalLoss = startWeight - GOAL_WEIGHT_LBS;
        const currentLoss = startWeight - currentAvg;
        const progressRaw =
            totalLoss > 0 ? (currentLoss / totalLoss) * 100 : 100;
        const progress = Math.min(Math.max(progressRaw, 0), 100);

        return html`
            <div class="progress-card">
                <div class="progress-title">
                    Weight goal: ${GOAL_WEIGHT_LBS} lbs
                </div>
                <div class="progress-value">
                    ${currentAvg.toFixed(1)} lbs (7-day avg)
                </div>
                <div class="progress-bar">
                    <div
                        class="progress-fill"
                        style="width: ${progress.toFixed(1)}%"
                    ></div>
                </div>
                <div class="progress-meta">
                    ${progress.toFixed(1)}% complete · Start
                    ${startWeight.toFixed(1)} lbs
                </div>
            </div>
        `;
    }

    private renderDateNavigator() {
        const todayValue = formatDate(new Date());
        const isToday = this.selectedDate === todayValue;

        return html`
            <div class="date-nav">
                <button
                    class="ghost"
                    type="button"
                    @click=${() => {
                        this.selectedDate = formatDate(
                            addDays(parseDate(this.selectedDate), -1),
                        );
                    }}
                >
                    Previous
                </button>
                <input
                    type="date"
                    .value=${this.selectedDate}
                    max=${todayValue}
                    @change=${(event: Event) => {
                        const target = event.target as HTMLInputElement;
                        if (!target.value) return;
                        if (target.value > todayValue) {
                            this.selectedDate = todayValue;
                            return;
                        }
                        this.selectedDate = target.value;
                    }}
                />
                <button
                    class="ghost"
                    type="button"
                    ?disabled=${isToday}
                    @click=${() => {
                        if (isToday) return;
                        const nextDate = formatDate(
                            addDays(parseDate(this.selectedDate), 1),
                        );
                        this.selectedDate =
                            nextDate > todayValue ? todayValue : nextDate;
                    }}
                >
                    Next
                </button>
                <button
                    class="ghost today ${isToday ? 'active' : ''}"
                    type="button"
                    @click=${() => {
                        this.selectedDate = todayValue;
                    }}
                >
                    Today
                </button>
            </div>
        `;
    }

    private renderWeeklyPlan(options?: {
        weekKey?: string;
        lockWeek?: boolean;
    }) {
        const weekKey = options?.weekKey ?? this.weekFocus;
        const lockWeek = Boolean(options?.lockWeek);
        const weekStart = parseDate(weekKey);
        const weekDates = Array.from({ length: 7 }, (_, index) =>
            formatDate(addDays(weekStart, index)),
        );
        const plan = this.appState.weekPlans[weekKey] ?? { dates: [] };
        const selected = new Set(plan.dates);
        const weekEnd = formatDate(addDays(weekStart, 6));
        const warning = plan.dates.length !== 3;

        return html`
            <div class="card inset">
                <div class="section-header">
                    <div>
                        <h3>Weekly lifting plan</h3>
                        <p class="subtle">
                            Pick exactly three dates for 30+ minutes.
                        </p>
                    </div>
                    <div class="range">
                        ${formatDisplayDate(weekKey)} -
                        ${formatDisplayDate(weekEnd)}
                    </div>
                </div>
                <label class="planner-label">
                    Week focus
                    <input
                        type="date"
                        .value=${weekKey}
                        ?disabled=${lockWeek}
                        @change=${(event: Event) => {
                            if (lockWeek) return;
                            const target = event.target as HTMLInputElement;
                            if (!target.value) return;
                            this.weekFocus = getWeekKey(
                                parseDate(target.value),
                            );
                        }}
                    />
                </label>
                <div class="week-grid">
                    ${weekDates.map((date) => {
                        const isSelected = selected.has(date);
                        return html`
                            <label
                                class="week-day ${isSelected ? 'selected' : ''}"
                            >
                                <input
                                    type="checkbox"
                                    .checked=${isSelected}
                                    @change=${(event: Event) => {
                                        const target =
                                            event.target as HTMLInputElement;
                                        const next = new Set(selected);
                                        if (target.checked) {
                                            if (next.size >= 3) {
                                                target.checked = false;
                                                return;
                                            }
                                            next.add(date);
                                        } else {
                                            next.delete(date);
                                        }
                                        this.updateWeekPlan(
                                            weekKey,
                                            Array.from(next).sort(),
                                        );
                                    }}
                                />
                                <span>${formatDisplayDate(date)}</span>
                            </label>
                        `;
                    })}
                </div>
                ${warning
                    ? html`<div class="warning">
                          Select exactly three lifting days for this week.
                      </div>`
                    : html`<div class="success">
                          Plan locked:
                          ${plan.dates
                              .map((date) => formatDisplayDate(date))
                              .join(', ')}
                      </div>`}
            </div>
        `;
    }

    private renderFastPlan(options?: {
        monthKey?: string;
        lockMonth?: boolean;
    }) {
        const monthKey = options?.monthKey ?? this.monthFocus;
        const lockMonth = Boolean(options?.lockMonth);
        const [year, month] = monthKey.split('-').map(Number);
        const monthIndex = month - 1;
        const daysInMonth = getDaysInMonth(year, monthIndex);
        const minDate = `${monthKey}-01`;
        const maxDate = `${monthKey}-${pad(daysInMonth - 2)}`;
        const plan = this.appState.fastPlans[monthKey] ?? { dates: [] };
        const startDate = plan.dates.length ? plan.dates[0] : '';
        const warning = plan.dates.length !== 3;
        const endDate = plan.dates.length === 3 ? plan.dates[2] : '';
        const lastMealDate = startDate
            ? formatDisplayDate(formatDate(addDays(parseDate(startDate), -1)))
            : '';
        const breakFastDate = endDate
            ? formatDisplayDate(formatDate(addDays(parseDate(endDate), 1)))
            : '';

        return html`
            <div class="card inset">
                <div class="section-header">
                    <div>
                        <h3>Monthly 3-day water-only fast</h3>
                        <p class="subtle">
                            Choose a start date to schedule three consecutive
                            days.
                        </p>
                    </div>
                </div>
                <div class="plan-row">
                    <label class="planner-label">
                        Month
                        <input
                            type="month"
                            .value=${monthKey}
                            ?disabled=${lockMonth}
                            @change=${(event: Event) => {
                                if (lockMonth) return;
                                const target = event.target as HTMLInputElement;
                                if (!target.value) return;
                                this.monthFocus = target.value;
                            }}
                        />
                    </label>
                    <label class="planner-label">
                        Fast start date
                        <input
                            type="date"
                            min=${minDate}
                            max=${maxDate}
                            .value=${startDate}
                            @change=${(event: Event) => {
                                const target = event.target as HTMLInputElement;
                                if (!target.value) {
                                    this.updateFastPlan(monthKey, []);
                                    return;
                                }
                                const start = parseDate(target.value);
                                const dates = [0, 1, 2].map((offset) =>
                                    formatDate(addDays(start, offset)),
                                );
                                this.updateFastPlan(monthKey, dates);
                            }}
                        />
                    </label>
                </div>
                <div class="plan-dates">
                    ${plan.dates.length
                        ? plan.dates.map(
                              (date) =>
                                  html`<span>${formatDisplayDate(date)}</span>`,
                          )
                        : html`<span class="subtle"
                              >No fast scheduled yet.</span
                          >`}
                </div>
                ${warning
                    ? html`<div class="warning">
                          Pick a start date to schedule all 3 days.
                      </div>`
                    : html`<div class="success">
                          Last meal ${lastMealDate} at night. Fast scheduled for
                          ${plan.dates
                              .map((date) => formatDisplayDate(date))
                              .join(', ')}.
                          Break the fast ${breakFastDate} in the morning.
                      </div>`}
            </div>
        `;
    }

    private renderSparkline(values: Array<number | null>, label: string) {
        const height = 36;
        const width = 200;
        const gap = 2;
        const barWidth = (width - gap * (values.length - 1)) / values.length;

        return html`
            <svg
                viewBox="0 0 ${width} ${height}"
                class="sparkline"
                aria-label=${label}
            >
                ${values.map((value, index) => {
                    if (value === null) {
                        return html``;
                    }
                    const barHeight = value === 1 ? height : height * 0.3;
                    const y = height - barHeight;
                    const x = index * (barWidth + gap);
                    const color =
                        value === 1 ? 'var(--accent)' : 'var(--danger)';
                    return html`<rect
                        x=${x}
                        y=${y}
                        width=${barWidth}
                        height=${barHeight}
                        fill=${color}
                    />`;
                })}
            </svg>
        `;
    }

    private buildLinePath(
        values: Array<number | null>,
        width: number,
        height: number,
        minValue: number,
        maxValue: number,
    ) {
        const defined = values.filter((value): value is number =>
            Number.isFinite(value),
        );
        if (!defined.length) return { path: '' };
        const paddedMin = minValue - 1;
        const paddedMax = maxValue + 1;
        const range = paddedMax - paddedMin || 1;

        let started = false;
        let path = '';
        values.forEach((value, index) => {
            if (value === null || !Number.isFinite(value)) {
                started = false;
                return;
            }
            const x = (index / (values.length - 1)) * width;
            const y = height - ((value - paddedMin) / range) * height;
            if (!started) {
                path += `M ${x} ${y}`;
                started = true;
            } else {
                path += ` L ${x} ${y}`;
            }
        });

        return { path };
    }

    private renderWeightChart() {
        const endDate = new Date();
        const dates = buildDateRange(endDate, CHART_DAYS);
        const values = dates.map((date) =>
            this.getDailyAverage(this.getDay(date)),
        );
        const rolling = dates.map((date) => this.getRollingAverage(date, 7));

        const width = 320;
        const height = 140;
        const allValues = [...values, ...rolling].filter(
            (value): value is number => Number.isFinite(value),
        );
        const min = allValues.length ? Math.min(...allValues) : 0;
        const max = allValues.length ? Math.max(...allValues) : 0;
        const line = this.buildLinePath(values, width, height, min, max);
        const smooth = this.buildLinePath(rolling, width, height, min, max);

        return html`
            <div class="chart-card">
                <div class="chart-header">
                    <div>
                        <h3>Weight trend (last ${CHART_DAYS} days)</h3>
                        <p class="subtle">
                            Daily average + 7-day rolling average.
                        </p>
                    </div>
                </div>
                <svg viewBox="0 0 ${width} ${height}" class="weight-chart">
                    <path
                        d=${line.path}
                        stroke="var(--accent)"
                        stroke-width="2"
                        fill="none"
                    />
                    <path
                        d=${smooth.path}
                        stroke="var(--accent-2)"
                        stroke-width="3"
                        fill="none"
                    />
                </svg>
            </div>
        `;
    }

    private renderGoalCharts() {
        const dates = buildDateRange(new Date(), CHART_DAYS);

        const dietValues = dates.map((date) => {
            const day = this.getDay(date);
            const hasData =
                day.dietException !== null ||
                day.dessertPass !== null ||
                day.mealPass !== null ||
                DIET_RULES.some((rule) => day.diet[rule.key] !== null);
            if (!hasData) return null;
            return this.dietRequirementSatisfied(day) ? 1 : 0;
        });

        const weightValues = dates.map((date) => {
            const day = this.getDay(date);
            const hasData =
                Number.isFinite(day.weightMorning) ||
                Number.isFinite(day.weightNight) ||
                day.weightMorningMissed ||
                day.weightNightMissed;
            if (!hasData) return null;
            return Number.isFinite(day.weightMorning) &&
                Number.isFinite(day.weightNight)
                ? 1
                : 0;
        });

        const liftingValues = dates.map((date) => {
            if (!this.isLiftingDay(date)) return null;
            const day = this.getDay(date);
            if (day.weightLiftingDone === null) return 0;
            return day.weightLiftingDone === 'yes' ? 1 : 0;
        });

        const fastValues = dates.map((date) => {
            if (!this.isFastDay(date)) return null;
            const day = this.getDay(date);
            if (day.waterFastDone === null) return 0;
            return day.waterFastDone === 'yes' ? 1 : 0;
        });

        const goalRows = [
            { label: 'Diet requirement met', values: dietValues },
            { label: 'Weights logged (am + pm)', values: weightValues },
            { label: 'Lifting days completed', values: liftingValues },
            { label: 'Fast days completed', values: fastValues },
        ];

        return html`
            <div class="chart-card">
                <div class="chart-header">
                    <div>
                        <h3>Goal performance</h3>
                        <p class="subtle">Last ${CHART_DAYS} days.</p>
                    </div>
                </div>
                <div class="goal-rows">
                    ${goalRows.map(
                        (row) => html`
                            <div class="goal-row">
                                <div class="goal-label">${row.label}</div>
                                ${this.renderSparkline(row.values, row.label)}
                            </div>
                        `,
                    )}
                </div>
            </div>
        `;
    }

    private renderBlockingOverlay(blocking: BlockingOverlay) {
        if (blocking.type === 'month') {
            const ready = this.isMonthPlanComplete(blocking.monthKey);
            return html`
                <div class="overlay">
                    <div class="overlay-card">
                        <div class="overlay-header">
                            <h2>Schedule your monthly fast</h2>
                            <p class="subtle">
                                Set the 3-day water-only fast for
                                ${formatMonthLabel(blocking.monthKey)} to
                                continue.
                            </p>
                        </div>
                        ${this.renderFastPlan({
                            monthKey: blocking.monthKey,
                            lockMonth: true,
                        })}
                        <div class="overlay-actions">
                            <button
                                class="ghost"
                                type="button"
                                ?disabled=${!ready}
                                @click=${() =>
                                    this.confirmMonthPlan(blocking.monthKey)}
                            >
                                Confirm fast schedule
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }

        if (blocking.type === 'week') {
            const ready = this.isWeekPlanComplete(blocking.weekKey);
            const weekStart = blocking.weekKey;
            const weekEnd = formatDate(addDays(parseDate(weekStart), 6));
            return html`
                <div class="overlay">
                    <div class="overlay-card">
                        <div class="overlay-header">
                            <h2>Plan this week's lifting</h2>
                            <p class="subtle">
                                Select three lifting days for
                                ${formatDisplayDate(weekStart)} to
                                ${formatDisplayDate(weekEnd)} to continue.
                            </p>
                        </div>
                        ${this.renderWeeklyPlan({
                            weekKey: blocking.weekKey,
                            lockWeek: true,
                        })}
                        <div class="overlay-actions">
                            <button
                                class="ghost"
                                type="button"
                                ?disabled=${!ready}
                                @click=${() =>
                                    this.confirmWeekPlan(blocking.weekKey)}
                            >
                                Confirm lifting plan
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }

        return html`
            <div class="overlay">
                <div class="overlay-card">
                    <div class="overlay-header">
                        <h2>Finish yesterday's check-in</h2>
                        <p class="subtle">
                            ${formatDisplayLong(blocking.date)} needs your
                            inputs before you move on.
                        </p>
                    </div>
                    ${this.renderDailyChecklist(blocking.date)}
                </div>
            </div>
        `;
    }

    render() {
        const blocking = this.getBlockingOverlay();

        return html`
            <div class="shell">
                <header class="hero">
                    <div>
                        <h1>Goal Tracker</h1>
                        <p class="hero-subtitle">
                            Daily focus, weekly momentum, monthly resets.
                        </p>
                    </div>
                    ${this.renderWeightProgress()}
                </header>

                <section class="card">
                    <div class="section-header">
                        <div>
                            <h2>Daily check-in</h2>
                            <p class="subtle">
                                Check in for any date you choose.
                            </p>
                        </div>
                        ${this.renderDateNavigator()}
                    </div>
                    ${this.renderDailyChecklist(this.selectedDate)}
                </section>

                <section class="card">
                    <div class="section-header">
                        <div>
                            <h2>Plans</h2>
                            <p class="subtle">
                                Lock in lifting days and fasting windows.
                            </p>
                        </div>
                    </div>
                    <div class="plan-grid">
                        ${this.renderWeeklyPlan()} ${this.renderFastPlan()}
                    </div>
                </section>

                <section class="card">
                    <div class="section-header">
                        <div>
                            <h2>Graphs</h2>
                            <p class="subtle">Signals that keep you honest.</p>
                        </div>
                    </div>
                    <div class="chart-grid">
                        ${this.renderWeightChart()} ${this.renderGoalCharts()}
                    </div>
                </section>
            </div>

            ${blocking ? this.renderBlockingOverlay(blocking) : null}
        `;
    }
}
