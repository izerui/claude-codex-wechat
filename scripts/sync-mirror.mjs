// npm publish 成功后自动触发 npmmirror(淘宝镜像)同步,把"发布 → 用户能 @latest 装到"
// 的延迟从最多 ~30 分钟压到 1~2 分钟。失败只告警、不抛错,绝不阻断发布流程。
const pkg = 'claude-codex-wechat';
const url = `https://registry.npmmirror.com/-/package/${pkg}/syncs`;

try {
  const res = await fetch(url, { method: 'PUT' });
  const data = await res.json().catch(() => ({}));
  if (data.ok) {
    console.log(`[sync-mirror] 已触发 npmmirror 同步(state=${data.state ?? 'unknown'}, id=${data.id ?? '-'})`);
  } else {
    console.warn(`[sync-mirror] 同步接口返回异常(不影响发布):`, JSON.stringify(data));
  }
} catch (error) {
  console.warn(`[sync-mirror] 触发同步失败(不影响发布,镜像仍会自动同步):`, error.message);
}
