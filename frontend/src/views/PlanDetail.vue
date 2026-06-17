<template>
  <div class="page" v-loading="loading">
    <el-page-header :icon="ArrowLeft" @back="$router.push('/plans')" style="margin-bottom: 12px">
      <template #content>
        <span style="font-size: 18px; font-weight: 600">{{ plan?.name }}</span>
        <status-tag :status="plan?.status" style="margin-left: 10px" />
      </template>
    </el-page-header>

    <!-- 流程进度条（动态工作流） -->
    <el-card v-if="plan" class="box-card" style="margin-bottom: 12px">
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center">
          <span style="font-weight: 600">📍 审批流程</span>
          <div>
            <el-tag v-if="progress.rejected" type="danger" size="small">已驳回</el-tag>
            <el-tag v-else-if="plan.status === 'PUBLISHED'" type="success" size="small">已发布</el-tag>
            <el-tag v-else-if="plan.status === 'DRAFT'" type="info" size="small">草稿</el-tag>
            <el-tag v-else type="warning" size="small">审批中 · {{ plan.currentNode || '-' }}</el-tag>
          </div>
        </div>
      </template>
      <div v-if="progress.steps.length" class="progress-wrap">
        <el-steps :active="progressActiveIndex" finish-status="success" align-center>
          <el-step
            v-for="(s, i) in progress.steps"
            :key="s.code"
            :title="s.name"
            :status="stepStatus(s, i)"
          />
        </el-steps>
      </div>
      <el-empty v-else description="暂无流程数据" :image-size="60" />
    </el-card>

    <el-row :gutter="16" v-if="plan">
      <!-- 左：基础信息 + 文档预览 -->
      <el-col :span="11">
        <el-card class="box-card">
          <template #header>
            <div style="display: flex; justify-content: space-between; align-items: center">
              <span style="font-weight: 600">基础信息</span>
              <div>
                <el-button v-if="canEdit" size="small" @click="$router.push(`/plans/${plan.id}/edit`)">编辑</el-button>
                <el-button v-if="canSubmit" size="small" type="primary" :loading="submitting" @click="onSubmit">提交审批</el-button>
              </div>
            </div>
          </template>
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="专业代码">{{ plan.code }}</el-descriptions-item>
            <el-descriptions-item label="专业名称">{{ plan.major }}</el-descriptions-item>
            <el-descriptions-item label="学制">{{ plan.duration }}</el-descriptions-item>
            <el-descriptions-item label="生源类型">{{ plan.studentType }}</el-descriptions-item>
            <el-descriptions-item label="版本年份">{{ plan.versionYear }}</el-descriptions-item>
            <el-descriptions-item label="院系">{{ plan.department?.name }}</el-descriptions-item>
            <el-descriptions-item label="发起人">{{ plan.createdBy?.name }}</el-descriptions-item>
            <el-descriptions-item label="当前节点">{{ plan.currentNode || '-' }}</el-descriptions-item>
            <el-descriptions-item label="创建时间">{{ formatTime(plan.createdAt) }}</el-descriptions-item>
            <el-descriptions-item label="提交时间">{{ formatTime(plan.submittedAt) }}</el-descriptions-item>
          </el-descriptions>
        </el-card>

        <el-card class="box-card" style="margin-top: 12px">
          <template #header>
            <div style="display: flex; justify-content: space-between; align-items: center">
              <span style="font-weight: 600">方案文档</span>
              <div v-if="canUpload">
                <el-upload :show-file-list="false" :before-upload="handleReupload" accept=".docx,.pdf">
                  <el-button size="small" type="primary" plain>重新上传</el-button>
                </el-upload>
              </div>
            </div>
          </template>
          <div v-if="!plan.fileName" class="empty">
            <el-icon style="font-size: 36px; color: #c0c4cc"><DocumentRemove /></el-icon>
            <p class="muted">尚未上传方案文档</p>
            <el-upload v-if="canUpload" :show-file-list="false" :before-upload="handleReupload" accept=".docx,.pdf">
              <el-button type="primary">点击上传</el-button>
            </el-upload>
          </div>
          <div v-else>
            <div class="file-meta">
              <el-icon><Document /></el-icon>
              <span>{{ plan.fileName }}</span>
              <span class="muted">({{ formatSize(plan.fileSize) }})</span>
              <el-button text type="primary" @click="downloadFile">下载</el-button>
            </div>
            <div ref="previewEl" class="preview-pane docx" v-if="isDocx">
              <div class="muted" v-if="!previewReady">正在加载预览...</div>
            </div>
            <iframe v-else-if="isPdf" :src="fileUrl" class="preview-pane" style="border: none"></iframe>
            <div v-else class="empty"><p class="muted">该文件类型不支持在线预览，请下载查看</p></div>
          </div>
        </el-card>
      </el-col>

      <!-- 右：AI 报告 + 审批轨迹 -->
      <el-col :span="13">
        <el-card class="box-card">
          <template #header>
            <div style="display: flex; justify-content: space-between; align-items: center">
              <span style="font-weight: 600">🤖 AI 政策合规性审核报告</span>
              <div>
                <el-tag v-if="report?.status === 'PENDING'" type="info">排队中</el-tag>
                <el-tag v-else-if="report?.status === 'RUNNING'" type="warning">审核中...</el-tag>
                <el-tag v-else-if="report?.status === 'SUCCESS'" type="success">已完成</el-tag>
                <el-tag v-else-if="report?.status === 'FAILED'" type="danger">失败</el-tag>
                <el-button v-if="report?.status === 'FAILED' && canUpload" size="small" text type="primary" @click="retryAI">重试</el-button>
              </div>
            </div>
          </template>

          <div v-if="!report" class="empty muted" style="padding: 24px 0; text-align: center">
            上传方案文档后，AI 将自动进行政策合规性审核
          </div>

          <div v-else-if="report.status === 'PENDING' || report.status === 'RUNNING'" style="padding: 16px 0">
            <el-skeleton :rows="4" animated />
            <p class="muted" style="text-align: center; margin-top: 12px">正在由 AI 审核引擎分析方案，请稍候...</p>
          </div>

          <div v-else-if="report.status === 'FAILED'">
            <el-alert :title="report.errorMessage || '审核失败'" type="error" :closable="false" show-icon />
            <p class="muted" style="margin-top: 8px; font-size: 12px">AI 审核失败不会影响审批流程，可继续人工审批。</p>
          </div>

          <div v-else-if="report.result">
            <div class="score-card">
              <div class="score-num" :style="{ color: scoreColor }">{{ report.score }}</div>
              <div class="score-label">综合得分</div>
            </div>
            <p style="margin: 12px 0">{{ report.summary }}</p>

            <div v-if="report.result.compliance_items?.length" class="report-section">
              <h4>合规性检查</h4>
              <div v-for="(it, i) in report.result.compliance_items" :key="i" class="report-item">
                <el-tag :type="itemType(it.status)" size="small" style="margin-right: 8px; min-width: 50px; text-align: center">
                  {{ statusText(it.status) }}
                </el-tag>
                <div style="flex: 1">
                  <div class="name"><b>{{ it.name }}</b></div>
                  <div class="meta">要求：{{ it.required || '-' }} ｜ 实际：{{ it.actual || '-' }}</div>
                  <div v-if="it.suggestion" class="suggestion">💡 {{ it.suggestion }}</div>
                </div>
              </div>
            </div>

            <div v-if="report.result.highlights?.length" class="report-section">
              <h4>亮点</h4>
              <ul style="margin: 0; padding-left: 20px">
                <li v-for="(h, i) in report.result.highlights" :key="i" style="color: #67c23a">{{ h }}</li>
              </ul>
            </div>

            <div v-if="report.result.risks?.length" class="report-section">
              <h4>风险提示</h4>
              <ul style="margin: 0; padding-left: 20px">
                <li v-for="(r, i) in report.result.risks" :key="i" style="color: #e6a23c">{{ r }}</li>
              </ul>
            </div>
          </div>
        </el-card>

        <!-- 岗课赛证 AI 分析报告 -->
        <el-card class="box-card" style="margin-top: 12px">
          <template #header>
            <div style="display: flex; justify-content: space-between; align-items: center">
              <span style="font-weight: 600">🧬 岗课赛证 AI 分析报告</span>
              <div>
                <el-tag v-if="gangluo?.status === 'PENDING'" type="info" size="small">排队中</el-tag>
                <el-tag v-else-if="gangluo?.status === 'RUNNING'" type="warning" size="small">分析中...</el-tag>
                <el-tag v-else-if="gangluo?.status === 'SUCCESS'" type="success" size="small">已完成</el-tag>
                <el-tag v-else-if="gangluo?.status === 'FAILED'" type="danger" size="small">失败</el-tag>
                <el-button v-if="!gangluo && plan.filePath" size="small" type="primary" :loading="triggering" @click="triggerGangluo">🧬 生成报告</el-button>
                <el-button v-if="gangluo?.status === 'FAILED' && canUpload" size="small" text type="primary" @click="retryGangluo">重试</el-button>
                <el-button v-if="gangluo?.status === 'SUCCESS'" size="small" text type="primary" @click="triggerGangluo">重新生成</el-button>
              </div>
            </div>
          </template>

          <div v-if="!gangluo" class="empty muted" style="padding: 16px 0; text-align: center">
            点击「生成报告」按钮，AI 将自动抽取岗位/课程/赛项/证书并交叉验证支撑关系
          </div>

          <div v-else-if="gangluo.status === 'PENDING' || gangluo.status === 'RUNNING'" style="padding: 16px 0">
            <el-skeleton :rows="3" animated />
            <p class="muted" style="text-align: center; margin-top: 12px">正在由 AI 分析岗课赛证支撑关系，请稍候...</p>
          </div>

          <div v-else-if="gangluo.status === 'FAILED'">
            <el-alert :title="gangluo.errorMessage || '分析失败'" type="error" :closable="false" show-icon />
          </div>

          <div v-else-if="gangluo.result">
            <!-- 雷达图 + 得分 -->
            <div class="gl-header">
              <radar-chart :scores="gangluo.result.score_breakdown" />
              <div class="gl-score-box">
                <div class="gl-score-num" :style="{ color: glScoreColor }">{{ gangluo.score }}</div>
                <div class="gl-score-label">综合支撑度</div>
                <p class="gl-summary">{{ gangluo.summary }}</p>
              </div>
            </div>

            <!-- 支撑矩阵 Tab -->
            <div class="report-section" v-if="hasMatrix">
              <h4>📊 支撑矩阵</h4>
              <el-tabs v-model="glMatrixTab" type="border-card">
                <el-tab-pane label="岗位 × 课程" name="position_course">
                  <table class="matrix-table">
                    <thead>
                      <tr><th style="width: 160px">岗位</th><th>支撑课程</th></tr>
                    </thead>
                    <tbody>
                      <tr v-for="row in gangluo.result.matrix.position_course" :key="row.position" :class="rowClass(row.matches)">
                        <td><b>{{ row.position }}</b></td>
                        <td>
                          <div v-for="(m, i) in row.matches" :key="i" class="match-row">
                            <span :class="['strength-badge', m.strength?.toLowerCase()]">{{ strengthIcon(m.strength) }} {{ m.course }}</span>
                            <span v-if="m.evidence" class="evidence">— {{ m.evidence }}</span>
                          </div>
                          <div v-if="!row.matches?.length" class="muted" style="font-size: 12px">无匹配课程 ⚠</div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </el-tab-pane>
                <el-tab-pane label="岗位 × 证书" name="position_certificate">
                  <table class="matrix-table">
                    <thead><tr><th style="width: 160px">岗位</th><th>支撑证书</th></tr></thead>
                    <tbody>
                      <tr v-for="row in gangluo.result.matrix.position_certificate" :key="row.position" :class="rowClass(row.matches)">
                        <td><b>{{ row.position }}</b></td>
                        <td>
                          <div v-for="(m, i) in row.matches" :key="i" class="match-row">
                            <span :class="['strength-badge', m.strength?.toLowerCase()]">{{ strengthIcon(m.strength) }} {{ m.certificate }}</span>
                            <span v-if="m.evidence" class="evidence">— {{ m.evidence }}</span>
                          </div>
                          <div v-if="!row.matches?.length" class="muted" style="font-size: 12px">无匹配证书</div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </el-tab-pane>
                <el-tab-pane label="岗位 × 赛项" name="position_competition">
                  <table class="matrix-table">
                    <thead><tr><th style="width: 160px">岗位</th><th>支撑赛项</th></tr></thead>
                    <tbody>
                      <tr v-for="row in gangluo.result.matrix.position_competition" :key="row.position" :class="rowClass(row.matches)">
                        <td><b>{{ row.position }}</b></td>
                        <td>
                          <div v-for="(m, i) in row.matches" :key="i" class="match-row">
                            <span :class="['strength-badge', m.strength?.toLowerCase()]">{{ strengthIcon(m.strength) }} {{ m.competition }}</span>
                            <span v-if="m.evidence" class="evidence">— {{ m.evidence }}</span>
                          </div>
                          <div v-if="!row.matches?.length" class="muted" style="font-size: 12px">无匹配赛项</div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </el-tab-pane>
              </el-tabs>
            </div>

            <!-- 逻辑断裂与薄弱环节 -->
            <div v-if="gangluo.result.gaps?.length" class="report-section">
              <h4>⚠️ 逻辑断裂与薄弱环节 ({{ gangluo.result.gaps.length }})</h4>
              <div v-for="(g, i) in gangluo.result.gaps" :key="i" :class="['gap-item', 'gap-' + (g.severity || 'LOW').toLowerCase()]">
                <div class="gap-head">
                  <el-tag :type="gapTag(g.severity)" size="small">{{ g.severity }}</el-tag>
                  <b>{{ g.target }}</b>
                  <span class="muted" style="font-size: 12px">· {{ gapTypeLabel(g.type) }}</span>
                </div>
                <div class="gap-desc">{{ g.description }}</div>
              </div>
            </div>

            <!-- 亮点 -->
            <div v-if="gangluo.result.highlights?.length" class="report-section">
              <h4>✓ 亮点</h4>
              <ul style="margin: 0; padding-left: 20px">
                <li v-for="(h, i) in gangluo.result.highlights" :key="i" style="color: #67c23a">{{ h }}</li>
              </ul>
            </div>

            <!-- 4 维抽取概览 -->
            <div v-if="hasDimensions" class="report-section">
              <h4>📦 抽取的 4 维条目</h4>
              <el-row :gutter="12">
                <el-col :span="6">
                  <div class="dim-card">
                    <div class="dim-title">🎯 岗位 ({{ gangluo.result.dimensions.positions?.length || 0 }})</div>
                    <div v-for="p in gangluo.result.dimensions.positions" :key="p.name" class="dim-item">
                      <b>{{ p.name }}</b>
                    </div>
                  </div>
                </el-col>
                <el-col :span="6">
                  <div class="dim-card">
                    <div class="dim-title">📚 课程 ({{ gangluo.result.dimensions.courses?.length || 0 }})</div>
                    <div v-for="c in gangluo.result.dimensions.courses" :key="c.name" class="dim-item">
                      {{ c.name }}<span v-if="c.category" class="muted"> · {{ c.category }}</span>
                    </div>
                  </div>
                </el-col>
                <el-col :span="6">
                  <div class="dim-card">
                    <div class="dim-title">📜 证书 ({{ gangluo.result.dimensions.certificates?.length || 0 }})</div>
                    <div v-for="c in gangluo.result.dimensions.certificates" :key="c.name" class="dim-item">{{ c.name }}</div>
                  </div>
                </el-col>
                <el-col :span="6">
                  <div class="dim-card">
                    <div class="dim-title">🏆 赛项 ({{ gangluo.result.dimensions.competitions?.length || 0 }})</div>
                    <div v-for="c in gangluo.result.dimensions.competitions" :key="c.name" class="dim-item">{{ c.name }}</div>
                  </div>
                </el-col>
              </el-row>
            </div>
          </div>
        </el-card>

        <el-card class="box-card" style="margin-top: 12px">
          <template #header>
            <div style="display: flex; justify-content: space-between; align-items: center">
              <span style="font-weight: 600">📅 方案生命周期</span>
              <span v-if="canHandleTask" class="muted" style="font-size: 12px">您当前是 <b style="color: #e6a23c">{{ currentTask?.nodeName }}</b> 审批人</span>
            </div>
          </template>
          <PlanLifecycleTimeline ref="timelineRef" :plan-id="plan.id" />
        </el-card>

        <el-card v-if="canHandleTask" class="box-card" style="margin-top: 12px">
          <template #header>
            <span style="font-weight: 600">⚡ 当前审批操作</span>
          </template>
          <el-input v-model="actionComment" type="textarea" :rows="2" placeholder="请输入审批意见（驳回必填）" />
          <div style="margin-top: 10px; text-align: right">
            <el-button type="danger" plain :loading="acting" @click="openRejectDialog">驳回</el-button>
            <el-button type="primary" :loading="acting" @click="onApprove">同意 · 流转至下一节点</el-button>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 驳回对话框：选择驳回目标 -->
    <el-dialog
      v-model="rejectDialogVisible"
      title="驳回方案"
      width="500px"
      :close-on-click-modal="false"
      append-to-body
    >
      <el-form label-width="84px" :model="{ rejectTarget }">
        <el-form-item label="审批意见" required>
          <el-input v-model="rejectComment" type="textarea" :rows="3" placeholder="请填写驳回原因" />
        </el-form-item>
        <el-form-item v-if="canRollback" label="驳回至">
          <el-radio-group v-model="rejectTarget">
            <el-radio value="CREATOR">发起人（退回修改）</el-radio>
            <el-radio value="PREV_NODE">
              上一节点：<b style="color: #e6a23c">{{ previousNode?.name || '上一审批节点' }}</b>
            </el-radio>
          </el-radio-group>
          <div class="muted" style="font-size: 12px; margin-top: 4px">
            选择"上一节点"后，方案将回到 <b>{{ previousNode?.name }}</b> 重新审批，发起人无需修改文档
          </div>
        </el-form-item>
        <el-form-item v-else label="驳回至">
          <el-tag size="small" type="info">当前已是流程第一个审批节点，只能退回给发起人</el-tag>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rejectDialogVisible = false">取消</el-button>
        <el-button type="danger" :loading="acting" @click="confirmReject">确认驳回</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { ArrowLeft, DocumentRemove } from '@element-plus/icons-vue';
import request from '@/api/request';
import { useUserStore } from '@/stores/user';
import StatusTag from '@/components/StatusTag.vue';
import RadarChart from '@/components/RadarChart.vue';
import PlanLifecycleTimeline from '@/components/PlanLifecycleTimeline.vue';

const route = useRoute();
const router = useRouter();
const user = useUserStore();
const plan = ref(null);
const report = ref(null);
const gangluo = ref(null);
const tasks = ref([]);
const progress = ref({ steps: [], currentNodeCode: null, rejected: false });
const loading = ref(false);
const submitting = ref(false);
const acting = ref(false);
const triggering = ref(false);
const actionComment = ref('');
const rejectDialogVisible = ref(false);
const rejectComment = ref('');
const rejectTarget = ref('CREATOR');
const previewEl = ref(null);
const previewReady = ref(false);
const timelineRef = ref(null);
const glMatrixTab = ref('position_course');

let pollHandle = null;
let glPollHandle = null;

const ROLE_LABELS = { TEACHER: '专业带头人', DEAN: '院长', ACADEMIC: '教务处', PRESIDENT: '校长', ADMIN: '管理员' };
const roleLabel = (r) => ROLE_LABELS[r] || r;
const formatTime = (t) => t ? new Date(t).toLocaleString('zh-CN') : '-';
const formatSize = (b) => b ? `${(b / 1024).toFixed(1)} KB` : '';

const fileUrl = computed(() => `/api/plans/${plan.value?.id}/file?_t=${Date.now()}`);
const isDocx = computed(() => plan.value?.fileName?.toLowerCase().endsWith('.docx'));
const isPdf = computed(() => plan.value?.fileName?.toLowerCase().endsWith('.pdf'));

const canEdit = computed(() => plan.value?.status === 'DRAFT' && plan.value?.createdById === user.info?.id);
const canUpload = computed(() => canEdit.value);
const canSubmit = computed(() => canEdit.value && plan.value?.filePath);
const currentTask = computed(() => plan.value?.tasks?.find((t) => t.action === 'PENDING'));
const canHandleTask = computed(() => {
  const t = currentTask.value;
  return t && t.roleRequired === user.role && plan.value?.status !== 'PUBLISHED';
});

// 当前节点的"上一节点"（用于驳回回退选项）
const previousNode = computed(() => {
  const steps = progress.value.steps;
  const code = plan.value?.currentNodeCode;
  if (!steps?.length || !code) return null;
  const idx = steps.findIndex((s) => s.code === code);
  if (idx > 0) return steps[idx - 1];
  return null;
});
// 仅当上一节点是真正的审批节点（不是 START/END/NOTIFY）时才显示回退选项
const canRollback = computed(() => {
  const p = previousNode.value;
  return !!p && !['START', 'END', 'NOTIFY'].includes(p.code);
});

const scoreColor = computed(() => {
  const s = report.value?.score || 0;
  if (s >= 80) return '#67c23a';
  if (s >= 60) return '#e6a23c';
  return '#f56c6c';
});

const glScoreColor = computed(() => {
  const s = gangluo.value?.score || 0;
  if (s >= 80) return '#67c23a';
  if (s >= 60) return '#e6a23c';
  return '#f56c6c';
});

const hasMatrix = computed(() => gangluo.value?.result?.matrix?.position_course);
const hasDimensions = computed(() => gangluo.value?.result?.dimensions);

const itemType = (s) => ({ PASS: 'success', WARN: 'warning', FAIL: 'danger' }[s] || 'info');
const statusText = (s) => ({ PASS: '通过', WARN: '警告', FAIL: '不通过' }[s] || s);
const timelineType = (a) => ({ APPROVED: 'success', REJECTED: 'danger', PENDING: 'primary' }[a] || 'primary');

const progressActiveIndex = computed(() => {
  if (plan.value?.status === 'PUBLISHED') return progress.value.steps.length;
  const idx = progress.value.steps.findIndex((s) => s.status === 'process');
  return idx >= 0 ? idx : 0;
});

function stepStatus(step, idx) {
  if (progress.value.rejected && step.status === 'wait') return 'error';
  return step.status;
}

// 岗课赛证辅助函数
const strengthIcon = (s) => ({ STRONG: '✓', MEDIUM: '⚠', WEAK: '✗' }[s] || '·');
const gapTag = (s) => ({ HIGH: 'danger', MEDIUM: 'warning', LOW: 'info' }[s] || 'info');
const gapTypeLabel = (t) => ({
  MISSING_COURSE: '缺失支撑课程',
  MISSING_CERTIFICATE: '缺失对应证书',
  MISSING_COMPETITION: '缺失相关赛项',
  WEAK_SUPPORT: '支撑薄弱',
  INTERNAL_INCONSISTENCY: '内部不一致',
}[t] || t);
function rowClass(matches) {
  if (!matches || !matches.length) return 'row-empty';
  if (matches.every((m) => m.strength === 'WEAK')) return 'row-weak';
  if (matches.some((m) => m.strength === 'STRONG')) return 'row-strong';
  return '';
}

async function loadPlan() {
  loading.value = true;
  try {
    plan.value = await request.get(`/plans/${route.params.id}`);
    tasks.value = plan.value.tasks || [];
    await Promise.all([loadReport(), loadGangluo(), loadProgress()]);
    if (timelineRef.value) timelineRef.value.reload();
    if (isDocx.value && plan.value.filePath) await renderDocx();
  } finally { loading.value = false; }
}

async function loadProgress() {
  try {
    progress.value = await request.get(`/plans/${route.params.id}/progress`);
  } catch (e) {
    progress.value = { steps: [], currentNodeCode: null, rejected: false };
  }
}

async function loadReport() {
  const r = await request.get(`/plans/${route.params.id}/ai-report`);
  report.value = r.status === 'NONE' ? null : r;
  if (r.status === 'PENDING' || r.status === 'RUNNING') {
    if (!pollHandle) pollHandle = setInterval(loadReport, 3000);
  } else {
    if (pollHandle) { clearInterval(pollHandle); pollHandle = null; }
  }
}

async function loadGangluo() {
  const r = await request.get(`/plans/${route.params.id}/ai-gangluo-report`);
  gangluo.value = r.status === 'NONE' ? null : r;
  if (r.status === 'PENDING' || r.status === 'RUNNING') {
    if (!glPollHandle) glPollHandle = setInterval(loadGangluo, 3000);
  } else {
    if (glPollHandle) { clearInterval(glPollHandle); glPollHandle = null; }
  }
}

async function triggerGangluo() {
  triggering.value = true;
  try {
    await request.post(`/plans/${plan.value.id}/ai-gangluo`);
    ElMessage.info('AI 岗课赛证分析已启动');
    await loadGangluo();
  } finally { triggering.value = false; }
}

async function retryGangluo() {
  await request.post(`/plans/${plan.value.id}/ai-gangluo-retry`);
  ElMessage.info('已重新触发');
  await loadGangluo();
}

async function renderDocx() {
  if (!previewEl.value) return;
  previewReady.value = false;
  previewEl.value.innerHTML = '';
  try {
    const docx = await import('docx-preview');
    const resp = await fetch(fileUrl.value, { headers: { Authorization: 'Bearer ' + user.token } });
    const blob = await resp.blob();
    await docx.renderAsync(blob, previewEl.value);
    previewReady.value = true;
  } catch (e) {
    previewEl.value.innerHTML = `<p class="muted">文档预览加载失败：${e.message}</p>`;
  }
}

function downloadFile() {
  const a = document.createElement('a');
  a.href = fileUrl.value + `&download=1`;
  a.target = '_blank';
  a.click();
}

async function handleReupload(file) {
  if (!canUpload.value) return ElMessage.warning('当前状态不可上传');
  const fd = new FormData();
  fd.append('file', file);
  await request.post(`/plans/${plan.value.id}/file`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
  ElMessage.success('已重新上传，AI 审核已重新触发');
  previewReady.value = false;
  await loadPlan();
}

async function retryAI() {
  await request.post(`/plans/${plan.value.id}/ai-retry`);
  ElMessage.info('已重新触发 AI 审核');
  await loadReport();
}

async function onSubmit() {
  submitting.value = true;
  try {
    await request.post(`/plans/${plan.value.id}/submit`);
    ElMessage.success('已提交，进入院长审批');
    await loadPlan();
  } finally { submitting.value = false; }
}

async function onApprove() {
  if (!currentTask.value) return;
  acting.value = true;
  try {
    await request.post(`/tasks/${currentTask.value.id}/approve`, { comment: actionComment.value });
    ElMessage.success('已同意，方案已流转');
    actionComment.value = '';
    await loadPlan();
  } finally { acting.value = false; }
}

function openRejectDialog() {
  if (!currentTask.value) return;
  // 优先复用"当前审批操作"区已填的意见；未填则在对话框内补充
  rejectComment.value = actionComment.value || '';
  // 默认目标：可回退 → 上一节点；不可回退 → 发起人
  rejectTarget.value = canRollback.value ? 'PREV_NODE' : 'CREATOR';
  rejectDialogVisible.value = true;
}

async function confirmReject() {
  if (!currentTask.value) return;
  if (!rejectComment.value.trim()) {
    return ElMessage.warning('驳回必须填写意见');
  }
  acting.value = true;
  try {
    const res = await request.post(`/tasks/${currentTask.value.id}/reject`, {
      comment: rejectComment.value,
      rejectTarget: rejectTarget.value,
    });
    const msg = res?.target === 'PREV_NODE'
      ? `已驳回至【${res.targetNodeName}】，等待重新审批`
      : '已驳回，方案回到草稿';
    ElMessage.success(msg);
    rejectDialogVisible.value = false;
    actionComment.value = '';
    rejectComment.value = '';
    await loadPlan();
  } finally { acting.value = false; }
}

onMounted(loadPlan);
onUnmounted(() => {
  if (pollHandle) clearInterval(pollHandle);
  if (glPollHandle) clearInterval(glPollHandle);
});
</script>

<style scoped>
.box-card { margin-bottom: 0; }
.file-meta { display: flex; align-items: center; gap: 8px; padding: 6px 0; }
.empty { text-align: center; padding: 32px 0; }
.score-card { text-align: center; padding: 16px 0; border-bottom: 1px solid #ebeef5; margin-bottom: 12px; }
.score-num { font-size: 42px; font-weight: 700; line-height: 1; }
.score-label { color: #909399; margin-top: 4px; }
.progress-wrap { padding: 8px 0 4px; }

/* 岗课赛证样式 */
.gl-header { display: flex; align-items: center; gap: 24px; padding: 8px 0 16px; border-bottom: 1px solid #ebeef5; margin-bottom: 12px; }
.gl-score-box { flex: 1; }
.gl-score-num { font-size: 36px; font-weight: 700; line-height: 1; }
.gl-score-label { color: #909399; font-size: 12px; margin-top: 4px; }
.gl-summary { margin: 8px 0 0; color: #606266; line-height: 1.6; }

.matrix-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.matrix-table th, .matrix-table td { padding: 8px 10px; border-bottom: 1px solid #ebeef5; text-align: left; vertical-align: top; }
.matrix-table th { background: #fafbfc; font-weight: 600; color: #303133; }
.matrix-table .row-weak { background: #fef0f0; }
.matrix-table .row-empty { background: #fdf6ec; }

.match-row { margin-bottom: 4px; }
.strength-badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 12px; margin-right: 4px; }
.strength-badge.strong { background: #e1f3d8; color: #67c23a; }
.strength-badge.medium { background: #fdf6ec; color: #e6a23c; }
.strength-badge.weak { background: #fef0f0; color: #f56c6c; }
.evidence { color: #909399; font-size: 12px; }

.gap-item { padding: 10px 12px; border-left: 3px solid #909399; background: #fafbfc; border-radius: 4px; margin-bottom: 8px; }
.gap-item.gap-high { border-left-color: #f56c6c; background: #fef0f0; }
.gap-item.gap-medium { border-left-color: #e6a23c; background: #fdf6ec; }
.gap-item.gap-low { border-left-color: #909399; }
.gap-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.gap-desc { color: #606266; font-size: 13px; line-height: 1.5; }

.dim-card { background: #fafbfc; border-radius: 6px; padding: 8px 10px; }
.dim-title { font-weight: 600; margin-bottom: 6px; font-size: 13px; }
.dim-item { padding: 3px 0; font-size: 12px; border-bottom: 1px dashed #ebeef5; }
.dim-item:last-child { border-bottom: none; }
</style>
