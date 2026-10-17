import { Ionicons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  Badge,
  Btn,
  Card,
  Chip,
  Divider,
  Empty,
  ErrorBar,
  Field,
  Loading,
  Row,
  Screen,
  SearchBar,
  Stat,
} from '@/components/ui';
import { useRoleDenied } from '@/components/role-gate';
import { Spacing } from '@/constants/brand';
import { useApi, useMutation } from '@/hooks/use-api';
import { useI18n } from '@/i18n';
import { formatArea, formatMoney, humanise } from '@/lib/format';
import { useCurrency } from '@/lib/currency';
import { createStyles, useTheme } from '@/lib/theme';

type Unit = {
  id: string;
  name: string;
  unitNumber?: string | null;
  unitType?: string;
  listingType?: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  floorPlan?: string | null;
  area?: number | null;
  price: number;
  status?: string;
  isSample?: boolean | null;
  project?: { id?: string; name?: string; developer?: { companyName?: string } } | null;
};

type Project = { id: string; name: string };

type Status = 'ALL' | 'AVAILABLE' | 'RESERVED' | 'SOLD' | 'HIDDEN' | 'SUSPENDED';

const STATUSES: Status[] = ['ALL', 'AVAILABLE', 'RESERVED', 'SOLD', 'HIDDEN', 'SUSPENDED'];

const BULK_STATUSES: Exclude<Status, 'ALL'>[] = ['AVAILABLE', 'RESERVED', 'SOLD', 'HIDDEN', 'SUSPENDED'];

/** Same vocabulary the website's CEO units page offers when adding a unit. */
const UNIT_TYPES = ['APARTMENT', 'VILLA', 'TOWNHOUSE', 'DUPLEX', 'PENTHOUSE', 'STUDIO'];
const LISTING_TYPES = ['SALE', 'RENT'];

const MAX_RENDER = 60;

/**
 * Unit management: price and availability changes without leaving the list,
 * exactly like the pricing screen, plus the add/delete surface of the
 * website's units page.
 *
 * `PATCH /api/ceo/units` takes `{ id, price }` and writes `PriceHistory`,
 * re-runs the anomaly check and pings anyone watching the unit — the same
 * record the pricing console edits. Delete is the route's soft delete: it
 * flips the unit to `HIDDEN`, so a mis-tap never removes inventory.
 *
 * Two website controls are deliberately absent: the per-row and bulk
 * hide/show toggles send `{ id, isHidden }`, but the route's allow-list drops
 * `isHidden` without writing anything — they are dead buttons on the site.
 * Bulk status and bulk delete here run the same per-id calls the website
 * fans out to, so the results match.
 */
export default function CeoUnitsScreen() {
  const styles = useStyles();
  const { t: theme } = useTheme();
  const { t, row, align } = useI18n();
  const { currency, rates } = useCurrency();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>('ALL');
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [price, setPrice] = useState('');
  const [editName, setEditName] = useState('');
  const [editFloorPlan, setEditFloorPlan] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<Exclude<Status, 'ALL'>>('AVAILABLE');
  const [bulkBusy, setBulkBusy] = useState(false);

  const [newProjectId, setNewProjectId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState(UNIT_TYPES[0]);
  const [newListing, setNewListing] = useState(LISTING_TYPES[0]);
  const [newBedrooms, setNewBedrooms] = useState('');
  const [newBathrooms, setNewBathrooms] = useState('');
  const [newArea, setNewArea] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newFloorPlan, setNewFloorPlan] = useState('');
  const [newSample, setNewSample] = useState(false);

  const params = new URLSearchParams();
  if (query.trim()) params.set('search', query.trim());
  if (status !== 'ALL') params.set('status', status);
  const qs = params.toString();

  const { data, error, loading, refreshing, refresh } = useApi<{ units?: Unit[] }>(
    qs ? `/api/ceo/units?${qs}` : '/api/ceo/units',
  );
  const { data: projectData } = useApi<{ projects?: Project[] }>(
    creating ? '/api/ceo/projects?limit=100' : null,
  );
  const mutation = useMutation();

  const projects = projectData?.projects ?? [];

  /** Returns whether the write landed, so callers can confirm success. */
  async function patch(unit: Unit, body: Record<string, unknown>): Promise<boolean> {
    setBusyId(unit.id);
    setProblem(null);
    setNotice(null);
    try {
      await mutation.run('/api/ceo/units', 'PATCH', { id: unit.id, ...body });
      refresh();
      return true;
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
      return false;
    } finally {
      setBusyId(null);
    }
  }

  /** The website's row edit: name + floor plan URL alongside the price. */
  async function saveDetails(unit: Unit) {
    if (!editName.trim()) {
      setProblem(t('ceo.unitRequired'));
      return;
    }
    const next = Number(price.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(next) || next <= 0) {
      setProblem(t('ceo.pricing.newPrice'));
      return;
    }
    const floorPlan = editFloorPlan.trim();
    if (await patch(unit, { name: editName.trim(), price: next, floorPlan: floorPlan || null })) {
      setNotice(t('ceo.pricing.updated'));
    }
  }

  async function remove(unit: Unit) {
    setBusyId(unit.id);
    setProblem(null);
    try {
      await mutation.run(`/api/ceo/units?id=${unit.id}`, 'DELETE');
      refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusyId(null);
    }
  }

  function confirmRemove(unit: Unit) {
    Alert.alert(t('ceo.deleteUnitTitle'), t('ceo.deleteUnitBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.confirm'), style: 'destructive', onPress: () => void remove(unit) },
    ]);
  }

  async function create() {
    const area = Number(newArea.replace(/[^\d.]/g, ''));
    const priceValue = Number(newPrice.replace(/[^\d.]/g, ''));
    if (!newProjectId || !newName.trim() || !Number.isFinite(area) || area <= 0 || !Number.isFinite(priceValue) || priceValue <= 0) {
      setProblem(t('ceo.unitRequired'));
      return;
    }
    setProblem(null);
    try {
      // `bathrooms` and `floorPlan` are optional on the route (`?? null) —
      // they ride along only when the CEO typed them, like the website.
      await mutation.run('/api/ceo/units', 'POST', {
        projectId: newProjectId,
        name: newName.trim(),
        unitType: newType,
        listingType: newListing,
        area,
        price: priceValue,
        ...(newBedrooms.trim() ? { bedrooms: Number(newBedrooms.replace(/\D/g, '')) || null } : {}),
        ...(newBathrooms.trim() ? { bathrooms: Number(newBathrooms.replace(/\D/g, '')) || null } : {}),
        ...(newFloorPlan.trim() ? { floorPlan: newFloorPlan.trim() } : {}),
        ...(newSample ? { isSample: true } : {}),
      });
      setCreating(false);
      setNewProjectId(null);
      setNewName('');
      setNewBedrooms('');
      setNewBathrooms('');
      setNewArea('');
      setNewPrice('');
      setNewFloorPlan('');
      setNewSample(false);
      setNotice(t('ceo.unitCreated'));
      refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }

  function toggleSelectAll(ids: string[]) {
    setSelectedIds((prev) => (prev.length === ids.length ? [] : ids));
  }

  /** Same fan-out the website runs: one PATCH per id. */
  async function bulkUpdateStatus() {
    const ids = selectedIds.slice();
    if (ids.length === 0) return;
    setBulkBusy(true);
    setProblem(null);
    try {
      await Promise.all(
        ids.map((id) =>
          mutation.run('/api/ceo/units', 'PATCH', { id, status: bulkStatus }),
        ),
      );
      setSelectedIds([]);
      setNotice(t('ceoI.bulkDone'));
      refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkRemove() {
    const ids = selectedIds.slice();
    if (ids.length === 0) return;
    setBulkBusy(true);
    setProblem(null);
    try {
      await Promise.all(ids.map((id) => mutation.run(`/api/ceo/units?id=${id}`, 'DELETE')));
      setSelectedIds([]);
      setNotice(t('ceoI.bulkDone'));
      refresh();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBulkBusy(false);
    }
  }

  /** Mirrors the website's `Delete ${n} unit(s)?` confirm. */
  function confirmBulkRemove() {
    Alert.alert(`${t('ceoI.deleteUnits')} (${selectedIds.length})?`, undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.confirm'), style: 'destructive', onPress: () => void bulkRemove() },
    ]);
  }

  const denied = useRoleDenied('ceo.forbidden', ['CEO', 'ADMIN']);
  if (denied) return denied;

  if (loading) return <Loading label={t('common.loading')} />;

  const all = data?.units ?? [];
  const countFor = (value: Exclude<Status, 'ALL'>) =>
    all.filter((u) => (u.status ?? 'AVAILABLE') === value).length;
  const rows = all.slice(0, MAX_RENDER);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: t('ceo.unitsScreen') }} />

      <Card style={[styles.kpis, row]}>
        <Stat value={all.length} label={t('ceo.units')} />
        <Stat value={countFor('AVAILABLE')} label={t('ceo.availableUnits')} />
        <Stat value={countFor('RESERVED')} label={humanise('RESERVED')} />
        <Stat value={countFor('SOLD')} label={humanise('SOLD')} />
      </Card>

      <SearchBar value={query} onChangeText={setQuery} placeholder={t('ceo.searchUnits')} />

      <View style={[styles.filters, row]}>
        {STATUSES.map((value) => {
          const count = value === 'ALL' ? all.length : countFor(value);
          return (
            <Chip
              key={value}
              label={value === 'ALL' ? `${t('common.all')} (${count})` : `${humanise(value)} (${count})`}
              selected={status === value}
              onPress={() => setStatus(value)}
            />
          );
        })}
      </View>

      <View style={[styles.toolbar, row]}>
        <Btn
          title={creating ? t('common.close') : t('ceo.createUnit')}
          variant={creating ? 'ghost' : 'primary'}
          style={styles.toolbarBtn}
          onPress={() => {
            setCreating((prev) => !prev);
            setProblem(null);
          }}
        />
        <Btn
          title={t('ceoI.bulkActions')}
          variant={selecting ? 'primary' : 'ghost'}
          style={styles.toolbarBtn}
          onPress={() => {
            setSelecting((prev) => !prev);
            setSelectedIds([]);
            setProblem(null);
          }}
        />
      </View>

      {creating ? (
        <Card style={styles.form}>
          <Text style={[styles.formLabel, align]}>{t('ceo.content.pick')}</Text>
          <View style={[styles.chipRow, row]}>
            {projects.map((project) => (
              <Chip
                key={project.id}
                label={project.name}
                selected={newProjectId === project.id}
                onPress={() => setNewProjectId(project.id)}
              />
            ))}
          </View>

          <Field label={t('ceo.unitName')} value={newName} onChangeText={setNewName} />

          <Text style={[styles.formLabel, align]}>{t('ceo.unitType')}</Text>
          <View style={[styles.chipRow, row]}>
            {UNIT_TYPES.map((type) => (
              <Chip
                key={type}
                label={humanise(type)}
                selected={newType === type}
                onPress={() => setNewType(type)}
              />
            ))}
          </View>

          <Text style={[styles.formLabel, align]}>{t('ceo.listingType')}</Text>
          <View style={[styles.chipRow, row]}>
            {LISTING_TYPES.map((type) => (
              <Chip
                key={type}
                label={humanise(type)}
                selected={newListing === type}
                onPress={() => setNewListing(type)}
              />
            ))}
          </View>

          <Field
            label={t('ceo.bedrooms')}
            value={newBedrooms}
            onChangeText={setNewBedrooms}
            keyboardType="numeric"
          />
          <Field
            label={t('ceoI.bathrooms')}
            value={newBathrooms}
            onChangeText={setNewBathrooms}
            keyboardType="numeric"
          />
          <Field
            label={`${t('common.area')} (m²)`}
            value={newArea}
            onChangeText={setNewArea}
            keyboardType="numeric"
          />
          <Field
            label={`${t('common.price')} (EGP)`}
            value={newPrice}
            onChangeText={setNewPrice}
            keyboardType="numeric"
          />
          <Field
            label={t('ceoI.floorPlan')}
            value={newFloorPlan}
            onChangeText={setNewFloorPlan}
            autoCapitalize="none"
          />
          <Text style={[styles.formLabel, align]}>{t('ceo.sampleModel')}</Text>
          <View style={[styles.chipRow, row]}>
            <Chip
              label={newSample ? t('ceo.sample') : t('common.no')}
              selected={newSample}
              onPress={() => setNewSample((prev) => !prev)}
            />
          </View>
          <Text style={[styles.count, align]}>{t('ceo.sampleHint')}</Text>
          <Btn title={t('ceo.createUnit')} busy={mutation.busy} onPress={() => void create()} />
        </Card>
      ) : null}

      {selecting ? (
        <Card style={styles.form}>
          <View style={[styles.bulkHead, row]}>
            <Text style={[styles.formLabel, align]}>
              {`${selectedIds.length} ${t('ceoI.selected')}`}
            </Text>
            <Pressable onPress={() => toggleSelectAll(all.map((u) => u.id))} hitSlop={8}>
              <Text style={styles.bulkLink}>{t('ceoI.selectAll')}</Text>
            </Pressable>
            <Pressable onPress={() => setSelectedIds([])} hitSlop={8}>
              <Text style={styles.bulkLink}>{t('common.clear')}</Text>
            </Pressable>
          </View>
          <Text style={[styles.formLabel, align]}>{t('common.status')}</Text>
          <View style={[styles.chipRow, row]}>
            {BULK_STATUSES.map((value) => (
              <Chip
                key={value}
                label={humanise(value)}
                selected={bulkStatus === value}
                onPress={() => setBulkStatus(value)}
              />
            ))}
          </View>
          <Btn
            title={t('ceoI.applyStatus')}
            busy={bulkBusy}
            disabled={selectedIds.length === 0}
            onPress={() => void bulkUpdateStatus()}
          />
          <Btn
            title={`${t('ceoI.deleteUnits')} (${selectedIds.length})`}
            variant="danger"
            disabled={selectedIds.length === 0 || bulkBusy}
            onPress={confirmBulkRemove}
          />
        </Card>
      ) : null}

      {error ? <ErrorBar message={error} onRetry={refresh} /> : null}
      {problem ? <ErrorBar message={problem} /> : null}
      {notice ? <Text style={[styles.notice, align]}>{`${notice} ✓`}</Text> : null}

      {!error && rows.length === 0 ? (
        <Empty title={t('ceo.units.none')} message={t('ceo.units.noneHint')} />
      ) : null}

      {all.length > MAX_RENDER ? (
        <Text style={[styles.count, align]}>
          {`${t('common.showingFirst')} ${MAX_RENDER} ${t('common.of')} ${all.length}`}
        </Text>
      ) : null}

      {rows.map((unit, index) => {
        const isOpen = expanded === unit.id && !selecting;
        const busy = busyId === unit.id;
        const unitStatus = unit.status ?? 'AVAILABLE';
        const checked = selectedIds.includes(unit.id);

        return (
          <View key={unit.id}>
            {index > 0 ? <Divider /> : null}
            <Card style={styles.card}>
              <Row
                left={
                  selecting ? (
                    <Pressable onPress={() => toggleSelect(unit.id)} hitSlop={8}>
                      <Ionicons
                        name={checked ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={checked ? theme.primary : theme.mutedForeground}
                      />
                    </Pressable>
                  ) : undefined
                }
                title={unit.name}
                subtitle={[
                  unit.project?.name,
                  unit.project?.developer?.companyName,
                  unit.unitType ? humanise(unit.unitType) : null,
                  unit.bedrooms != null ? `${unit.bedrooms} ${t('ceo.bedrooms')}` : null,
                  unit.bathrooms != null ? `${unit.bathrooms} ${t('ceoI.bathrooms')}` : null,
                  formatArea(unit.area ?? null),
                ]
                  .filter(Boolean)
                  .join(' · ')}
                badge={
                  <>
                    <Badge tone={toneForUnit(unitStatus)}>{humanise(unitStatus)}</Badge>
                    {unit.isSample ? <Badge tone="gold">{t('ceo.sample')}</Badge> : null}
                  </>
                }
                right={
                  <Text style={styles.price}>
                    {formatMoney(unit.price, currency, rates, { compact: true })}
                  </Text>
                }
                onPress={() => {
                  if (selecting) {
                    toggleSelect(unit.id);
                    return;
                  }
                  setExpanded(isOpen ? null : unit.id);
                  setEditName(unit.name);
                  setEditFloorPlan(unit.floorPlan ?? '');
                  setPrice(String(unit.price ?? ''));
                  setProblem(null);
                  setNotice(null);
                }}
              />

              {isOpen ? (
                <View style={styles.editor}>
                  <Divider />
                  <Field
                    label={t('ceo.unitName')}
                    value={editName}
                    onChangeText={setEditName}
                  />
                  <Field
                    label={t('ceoI.floorPlan')}
                    value={editFloorPlan}
                    onChangeText={setEditFloorPlan}
                    autoCapitalize="none"
                  />
                  <Field
                    label={t('ceo.pricing.newPrice')}
                    value={price}
                    onChangeText={setPrice}
                    keyboardType="numeric"
                  />
                  <Btn
                    title={t('common.save')}
                    busy={busy}
                    onPress={() => void saveDetails(unit)}
                  />

                  <Text style={[styles.formLabel, align]}>{t('common.status')}</Text>
                  <View style={[styles.chipRow, row]}>
                    {STATUSES.filter((value): value is Exclude<Status, 'ALL'> => value !== 'ALL').map(
                      (value) => (
                        <Chip
                          key={value}
                          label={humanise(value)}
                          disabled={busy}
                          selected={unitStatus === value}
                          onPress={() => unitStatus !== value && void patch(unit, { status: value })}
                        />
                      ),
                    )}
                  </View>

                  <Text style={[styles.formLabel, align]}>{t('ceo.sampleModel')}</Text>
                  <View style={[styles.chipRow, row]}>
                    <Chip
                      label={unit.isSample ? t('ceo.sample') : t('common.no')}
                      disabled={busy}
                      selected={Boolean(unit.isSample)}
                      onPress={() => void patch(unit, { isSample: !unit.isSample })}
                    />
                  </View>

                  <Btn
                    title={t('common.delete')}
                    variant="danger"
                    disabled={busy}
                    onPress={() => confirmRemove(unit)}
                  />
                </View>
              ) : null}
            </Card>
          </View>
        );
      })}
    </Screen>
  );
}

function toneForUnit(status: string): 'green' | 'red' | 'gold' | 'muted' {
  const s = status.toUpperCase();
  if (s === 'AVAILABLE') return 'green';
  if (s === 'SOLD' || s === 'SUSPENDED') return 'red';
  if (s === 'RESERVED') return 'gold';
  return 'muted';
}

const useStyles = createStyles((t) =>
  StyleSheet.create({
    kpis: { justifyContent: 'space-around', paddingVertical: Spacing.md },
    filters: { flexWrap: 'wrap', gap: 8 },
    toolbar: { gap: 8 },
    toolbarBtn: { flex: 1 },
    count: { color: t.mutedForeground, fontSize: 13 },
    notice: { color: t.successFg, fontSize: 14, fontWeight: '700' },
    card: { gap: 0, marginTop: Spacing.xs },
    price: { color: t.primary, fontSize: 14, fontWeight: '800' },
    form: { gap: 8 },
    formLabel: { color: t.mutedForeground, fontSize: 14, fontWeight: '500' },
    chipRow: { flexWrap: 'wrap', gap: 8 },
    bulkHead: { alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    bulkLink: { color: t.primary, fontSize: 14, fontWeight: '700' },
    editor: { gap: 8, marginTop: 8 },
  }),
);
