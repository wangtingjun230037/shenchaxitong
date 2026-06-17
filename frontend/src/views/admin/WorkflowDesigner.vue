<template>
  <div class="designer-page">
    <div class="designer-header">
      <el-button @click="goBack" text>← 返回</el-button>
      <div class="title-area">
        <el-input v-if="isEdit" v-model="workflow.name" placeholder="工作流名称" size="default" style="width: 300px" />
        <span v-else style="font-size: 18px; font-weight: 600">{{ workflow.name }}</span>
        <span v-if="!isNew" style="margin-left: 8px; color: #999; font-size: 13px">ID #{{ workflow.id }}</span>
      </div>
      <div class="actions">
        <el-button v-if="isEdit" @click="onValidate">校验</el-button>
        <el-button v-if="isEdit" type="primary" @click="onSave" :loading="saving">保存</el-button>
        <el-button v-if="!isEdit && isAdmin" @click="onEnterEdit">编辑</el-button>
      </div>
    </div>

    <div v-if="!isEdit && workflow.description" class="description">{{ workflow.description }}</div>

    <div class="designer-body">
      <!-- 左侧节点面板 -->
      <div class="sidebar-left">
        <div class="section-title">节点</div>
        <div v-if="isEdit" class="palette">
          <div class="palette-item" data-shape="START" @click="addNode('START')">
            <div class="node-mini start">开始</div>
            <span>开始</span>
          </div>
          <div class="palette-item" data-shape="APPROVAL" @click="addNode('APPROVAL')">
            <div class="node-mini approval">审批</div>
            <span>审批</span>
          </div>
          <div class="palette-item" data-shape="NOTIFY" @click="addNode('NOTIFY')">
            <div class="node-mini notify">抄送</div>
            <span>抄送</span>
          </div>
          <div class="palette-item" data-shape="END" @click="addNode('END')">
            <div class="node-mini end">结束</div>
            <span>结束</span>
          </div>
        </div>
        <div v-else class="readonly-list">
          <div v-for="n in workflow.nodes" :key="n.code" class="ro-item">
            <el-tag size="small" :type="nodeTagType(n.code)">{{ codeLabel(n.code) }}</el-tag>
            <span>{{ n.name }}</span>
          </div>
        </div>
      </div>

      <!-- 中央画布 -->
      <div ref="containerRef" class="canvas-area"></div>

      <!-- 右侧属性面板 -->
      <div class="sidebar-right">
        <div class="section-title">{{ isEdit ? '节点属性' : '流程信息' }}</div>
        <template v-if="isEdit">
          <div v-if="!selectedNode" class="empty-tip">点击画布上的节点编辑属性</div>
          <div v-else class="prop-form">
            <el-form label-position="top" size="small">
              <el-form-item label="节点 code（不可重复）">
                <el-input v-model="selectedNode.code" :disabled="!canEditCode(selectedNode)" />
              </el-form-item>
              <el-form-item label="节点名称">
                <el-input v-model="selectedNode.name" />
              </el-form-item>
              <template v-if="selectedNode.code === 'APPROVAL' || ['DEPT_REVIEW','ACADEMIC_REVIEW','PRESIDENT_REVIEW'].includes(selectedNode.code)">
                <el-form-item label="审批角色">
                  <el-select v-model="selectedNode.role" placeholder="选择角色">
                    <el-option label="院长" value="DEAN" />
                    <el-option label="教务" value="ACADEMIC" />
                    <el-option label="校长" value="PRESIDENT" />
                    <el-option label="管理员" value="ADMIN" />
                  </el-select>
                </el-form-item>
                <el-form-item label="审批人范围">
                  <el-select v-model="selectedNode.approverScope" placeholder="选择范围">
                    <el-option label="本院系院长" value="OWN_DEPT_DEAN" />
                    <el-option label="所有院长（任一通过）" value="ALL_DEAN" />
                    <el-option label="所有院长（会签）" value="ALL_SIGN_DEAN" />
                    <el-option label="自定义用户" value="CUSTOM_USERS" />
                  </el-select>
                </el-form-item>
                <el-form-item v-if="selectedNode.approverScope === 'CUSTOM_USERS'" label="指定审批人">
                  <el-select v-model="customUserIds" multiple filterable placeholder="选择用户" style="width: 100%">
                    <el-option v-for="u in allUsers" :key="u.id" :label="`${u.name}（${u.username}）`" :value="u.id" />
                  </el-select>
                </el-form-item>
              </template>
              <template v-if="selectedNode.code === 'NOTIFY'">
                <el-form-item label="通知人">
                  <el-select v-model="notifyUserIds" multiple filterable placeholder="选择用户" style="width: 100%">
                    <el-option v-for="u in allUsers" :key="u.id" :label="`${u.name}（${u.username}）`" :value="u.id" />
                  </el-select>
                </el-form-item>
              </template>
              <el-form-item>
                <el-button text type="danger" @click="removeNode">删除节点</el-button>
              </el-form-item>
            </el-form>
          </div>
        </template>
        <template v-else>
          <div v-if="workflow.edges && workflow.edges.length > 0" class="ro-edges">
            <div class="section-sub">流转关系</div>
            <div v-for="(e, i) in workflow.edges" :key="i" class="ro-edge">
              <span>{{ edgeSourceName(e.sourceId) }}</span>
              <span>→</span>
              <span>{{ edgeTargetName(e.targetId) }}</span>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- 校验错误提示 -->
    <el-dialog v-model="validateDialog" title="校验结果" width="500px">
      <div v-if="validateErrors.length === 0" class="ok-msg">✓ 工作流定义合法</div>
      <div v-else>
        <el-alert
          v-for="err in validateErrors"
          :key="err.code"
          :title="err.message"
          type="error"
          :closable="false"
          style="margin-bottom: 8px"
        />
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Graph } from '@antv/x6';
import { workflowApi } from '@/api/workflows';
import request from '@/api/request';
import { useUserStore } from '@/stores/user';

const route = useRoute();
const router = useRouter();
const user = useUserStore();
const isAdmin = computed(() => user.role === 'ADMIN');
const isNew = computed(() => route.path === '/admin/workflows/new');
const isEdit = computed(() => route.query.edit === '1' || isNew.value);

const containerRef = ref(null);
const workflow = ref({ name: '', description: '', nodes: [], edges: [] });
const selectedNode = ref(null);
const saving = ref(false);
const validateDialog = ref(false);
const validateErrors = ref([]);
const allUsers = ref([]);
const customUserIds = ref([]);
const notifyUserIds = ref([]);

let graph = null;
const graphNodes = new Map(); // code -> x6 node

function codeLabel(code) {
  return { START: '开始', APPROVAL: '审批', NOTIFY: '抄送', END: '结束' }[code] || code;
}
function nodeTagType(code) {
  return { START: 'success', APPROVAL: 'warning', NOTIFY: 'info', END: '' }[code] || '';
}
function canEditCode(n) {
  return n.code !== 'START' && n.code !== 'END';
}
function edgeSourceName(code) {
  const n = workflow.value.nodes.find((x) => x.code === code);
  return n ? n.name : code;
}
function edgeTargetName(code) {
  const n = workflow.value.nodes.find((x) => x.code === code);
  return n ? n.name : code;
}

async function loadUsers() {
  try {
    const data = await request.get('/users');
    allUsers.value = data.filter((u) => u.status === 'ACTIVE');
  } catch (e) {
    console.warn('load users failed', e);
  }
}

async function load() {
  if (isNew.value) {
    workflow.value = { name: '新工作流', description: '', nodes: [], edges: [] };
    initGraph();
    return;
  }
  const data = await workflowApi.get(route.params.id);
  workflow.value = {
    id: data.id,
    name: data.name,
    description: data.description,
    status: data.status,
    nodes: data.nodes || [],
    edges: data.edges || [],
  };
  initGraph();
  renderFromWorkflow();
}

function initGraph() {
  if (!containerRef.value) return;
  if (graph) {
    graph.dispose();
    graph = null;
  }
  graph = new Graph({
    container: containerRef.value,
    autoResize: true,
    background: { color: '#fafbfc' },
    grid: { visible: true, type: 'mesh', args: [{ color: '#e8e8e8', thickness: 1 }] },
    panning: true,
    mousewheel: { enabled: true, zoomAtMousePosition: true, modifiers: 'ctrl' },
    connecting: {
      router: { name: 'manhattan' },
      snap: { radius: 20 },
      allowBlank: false,
      allowLoop: false,
      allowNode: false,
      allowEdge: false,
      allowMulti: 'withPort',
      highlight: true,
    },
    interacting: isEdit.value ? { nodeMovable: true } : { nodeMovable: false },
  });

  // 监听节点点击
  graph.on('node:click', ({ node }) => {
    if (!isEdit.value) return;
    const code = node.getData()?.code;
    const n = workflow.value.nodes.find((x) => x.code === code);
    if (n) {
      selectedNode.value = { ...n };
      // 反序列化用户数组
      if (n.approverUserIds) {
        try { customUserIds.value = JSON.parse(n.approverUserIds); } catch { customUserIds.value = []; }
      } else customUserIds.value = [];
      if (n.notifyUserIds) {
        try { notifyUserIds.value = JSON.parse(n.notifyUserIds); } catch { notifyUserIds.value = []; }
      } else notifyUserIds.value = [];
    }
  });

  // 监听节点位置变化
  graph.on('node:change:position', ({ node }) => {
    const code = node.getData()?.code;
    const n = workflow.value.nodes.find((x) => x.code === code);
    if (n) {
      n.x = node.getPosition().x;
      n.y = node.getPosition().y;
    }
  });

  // 监听边连接完成
  graph.on('edge:connected', ({ edge }) => {
    const source = edge.getSourceCellId();
    const target = edge.getTargetCellId();
    if (!source || !target || source === target) {
      graph.removeEdge(edge);
      return;
    }
    // 更新 workflow.edges
    const sourceNode = graph.getCellById(source);
    const targetNode = graph.getCellById(target);
    const sourceCode = sourceNode?.getData()?.code;
    const targetCode = targetNode?.getData()?.code;
    if (!sourceCode || !targetCode) {
      graph.removeEdge(edge);
      return;
    }
    // 移除该 source 已有的边（每个 source 只允许一条出边）
    const existing = workflow.value.edges.find((e) => e.source === sourceCode);
    if (existing) {
      workflow.value.edges = workflow.value.edges.filter((e) => e.source !== sourceCode);
      // 移除画布上的对应边
      const oldEdge = graph.getEdges().find((e) => {
        const sc = e.getSourceCellId();
        return sc === source && e.id !== edge.id;
      });
      if (oldEdge) graph.removeEdge(oldEdge);
    }
    workflow.value.edges.push({ source: sourceCode, target: targetCode });
  });

  // 监听边双击删除
  graph.on('edge:dblclick', ({ edge }) => {
    if (!isEdit.value) return;
    const sourceId = edge.getSourceCellId();
    const sourceNode = graph.getCellById(sourceId);
    const sourceCode = sourceNode?.getData()?.code;
    if (sourceCode) {
      workflow.value.edges = workflow.value.edges.filter((e) => e.source !== sourceCode);
    }
    graph.removeEdge(edge);
  });
}

function renderFromWorkflow() {
  if (!graph) return;
  graph.clearCells();
  graphNodes.clear();
  // 添加节点
  for (const n of workflow.value.nodes) {
    const shape = getShapeForCode(n.code);
    const cell = graph.addNode({
      id: `n_${n.code}`,
      shape,
      x: n.x ?? 100,
      y: n.y ?? 100,
      width: n.width ?? (n.code === 'START' || n.code === 'END' ? 100 : 120),
      height: n.height ?? (n.code === 'START' || n.code === 'END' ? 50 : 60),
      label: n.name,
      data: { code: n.code },
      ports: getPortsForCode(n.code),
    });
    graphNodes.set(n.code, cell);
  }
  // 添加边
  for (const e of workflow.value.edges) {
    const source = graphNodes.get(e.source);
    const target = graphNodes.get(e.target);
    if (source && target) {
      graph.addEdge({
        source: { cell: source.id },
        target: { cell: target.id },
      });
    }
  }
}

function getShapeForCode(code) {
  if (code === 'START') return 'rect';
  if (code === 'END') return 'rect';
  if (code === 'NOTIFY') return 'rect';
  return 'rect'; // APPROVAL
}

function getPortsForCode(code) {
  if (code === 'START') {
    return [{ id: 'out', group: 'right' }];
  }
  if (code === 'END') {
    return [{ id: 'in', group: 'left' }];
  }
  return [
    { id: 'in', group: 'left' },
    { id: 'out', group: 'right' },
  ];
}

let nodeCounter = 0;
function genCode(shape) {
  while (true) {
    const code = `${shape}_${++nodeCounter}_${Date.now().toString(36)}`;
    if (!workflow.value.nodes.find((n) => n.code === code)) return code;
  }
}

function addNode(shape) {
  // 约束：START/END 各只允许 1 个
  if ((shape === 'START' || shape === 'END') && workflow.value.nodes.find((n) => n.code === shape)) {
    ElMessage.warning(`${codeLabel(shape)} 节点已存在`);
    return;
  }
  const code = (shape === 'START' || shape === 'END') ? shape : genCode(shape);
  const x = 100 + (workflow.value.nodes.length % 4) * 180;
  const y = 100 + Math.floor(workflow.value.nodes.length / 4) * 100;
  const newNode = {
    code,
    name: codeLabel(shape),
    role: shape === 'APPROVAL' ? 'DEAN' : null,
    approverScope: shape === 'APPROVAL' ? 'OWN_DEPT_DEAN' : null,
    approverUserIds: null,
    notifyUserIds: null,
    x, y,
    width: (shape === 'START' || shape === 'END') ? 100 : 120,
    height: (shape === 'START' || shape === 'END') ? 50 : 60,
  };
  workflow.value.nodes.push(newNode);
  const cell = graph.addNode({
    id: `n_${code}`,
    shape: 'rect',
    x, y,
    width: newNode.width,
    height: newNode.height,
    label: newNode.name,
    attrs: getNodeAttrs(shape),
    data: { code },
    ports: getPortsForCode(code),
  });
  graphNodes.set(code, cell);
  // 自动连边：如果有上一节点（最后添加的非 START 非孤立节点），连上
  // 简化：暂不自动连，让用户手动连
}

function getNodeAttrs(shape) {
  const colors = {
    START: { fill: '#f0f9eb', stroke: '#67c23a' },
    END: { fill: '#f4f4f5', stroke: '#909399' },
    APPROVAL: { fill: '#fdf6ec', stroke: '#e6a23c' },
    NOTIFY: { fill: '#ecf5ff', stroke: '#409eff' },
  };
  const c = colors[shape] || colors.APPROVAL;
  return {
    body: { fill: c.fill, stroke: c.stroke, strokeWidth: 2, rx: 6, ry: 6 },
    label: { fill: '#333', fontSize: 13 },
  };
}

function removeNode() {
  if (!selectedNode.value) return;
  const code = selectedNode.value.code;
  if (code === 'START' || code === 'END') {
    ElMessage.warning('开始/结束节点不可删除');
    return;
  }
  // 移除节点相关边
  workflow.value.edges = workflow.value.edges.filter((e) => e.source !== code && e.target !== code);
  // 移除画布上的节点和边
  const cell = graphNodes.get(code);
  if (cell) {
    graph.removeNode(cell);
    graphNodes.delete(code);
  }
  workflow.value.nodes = workflow.value.nodes.filter((n) => n.code !== code);
  selectedNode.value = null;
}

// 同步右侧表单 → selectedNode.approverUserIds / notifyUserIds
watch(customUserIds, (v) => {
  if (selectedNode.value) selectedNode.value.approverUserIds = JSON.stringify(v);
});
watch(notifyUserIds, (v) => {
  if (selectedNode.value) selectedNode.value.notifyUserIds = JSON.stringify(v);
});

async function onSave() {
  saving.value = true;
  try {
    const payload = {
      name: workflow.value.name,
      description: workflow.value.description,
      nodes: workflow.value.nodes.map((n) => ({
        code: n.code, name: n.name,
        role: n.role, approverScope: n.approverScope,
        approverUserIds: n.approverUserIds,
        notifyUserIds: n.notifyUserIds,
        x: n.x, y: n.y, width: n.width, height: n.height,
      })),
      edges: workflow.value.edges,
    };
    if (isNew.value) {
      const w = await workflowApi.create(payload);
      ElMessage.success('已创建');
      router.replace({ path: `/admin/workflows/${w.id}`, query: { edit: 1 } });
    } else {
      await workflowApi.update(workflow.value.id, payload);
      ElMessage.success('已保存');
      load();
    }
  } catch (e) {
    ElMessage.error(e.response?.data?.message || e.message);
  } finally {
    saving.value = false;
  }
}

async function onValidate() {
  try {
    const res = await workflowApi.validate({
      nodes: workflow.value.nodes,
      edges: workflow.value.edges,
    });
    validateErrors.value = res.errors;
    if (!res.valid) {
      validateDialog.value = true;
    } else {
      ElMessage.success('校验通过');
    }
  } catch (e) {
    ElMessage.error(e.message);
  }
}

function onEnterEdit() {
  router.replace({ path: `/admin/workflows/${workflow.value.id}`, query: { edit: 1 } });
}

function goBack() {
  router.push('/admin/workflows');
}

onMounted(async () => {
  await loadUsers();
  await nextTick();
  load();
});

onBeforeUnmount(() => {
  graph?.dispose();
  graph = null;
});
</script>

<style scoped>
.designer-page { display: flex; flex-direction: column; height: calc(100vh - 100px); }
.designer-header { display: flex; align-items: center; gap: 12px; padding-bottom: 12px; border-bottom: 1px solid #ebeef5; }
.title-area { flex: 1; display: flex; align-items: center; gap: 8px; }
.actions { display: flex; gap: 8px; }
.description { padding: 8px 12px; background: #f5f7fa; border-radius: 4px; margin: 8px 0; color: #606266; font-size: 13px; }
.designer-body { flex: 1; display: flex; gap: 0; border: 1px solid #ebeef5; border-radius: 4px; overflow: hidden; }
.sidebar-left, .sidebar-right { width: 220px; padding: 12px; background: #fafafa; overflow-y: auto; }
.canvas-area { flex: 1; background: #fafbfc; min-height: 500px; }
.section-title { font-weight: 600; font-size: 14px; margin-bottom: 12px; }
.section-sub { font-weight: 500; font-size: 13px; margin: 12px 0 8px; color: #666; }
.palette { display: flex; flex-direction: column; gap: 8px; }
.palette-item { display: flex; align-items: center; gap: 8px; padding: 8px; background: #fff; border: 1px dashed #dcdfe6; border-radius: 4px; cursor: pointer; }
.palette-item:hover { background: #f0f9eb; border-color: #67c23a; }
.node-mini { width: 40px; height: 24px; border-radius: 3px; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #fff; }
.node-mini.start { background: #67c23a; }
.node-mini.end { background: #909399; }
.node-mini.approval { background: #e6a23c; }
.node-mini.notify { background: #409eff; }
.readonly-list { display: flex; flex-direction: column; gap: 8px; }
.ro-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; background: #fff; border-radius: 4px; font-size: 13px; }
.ro-edges .ro-edge { display: flex; gap: 6px; padding: 4px 0; font-size: 12px; color: #606266; }
.empty-tip { color: #909399; font-size: 13px; padding: 12px 0; }
.prop-form { background: #fff; padding: 12px; border-radius: 4px; }
</style>
