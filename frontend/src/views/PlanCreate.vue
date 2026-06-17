<template>
  <div class="page">
    <el-card>
      <template #header>
        <span style="font-weight: 600">{{ isEdit ? '编辑培养方案' : '新建培养方案' }}</span>
      </template>

      <el-row :gutter="24">
        <el-col :span="14">
          <el-form :model="form" :rules="rules" ref="formRef" label-width="120px">
            <el-form-item label="方案名称" prop="name">
              <el-input v-model="form.name" placeholder="如：软件技术专业人才培养方案（2026版）" />
            </el-form-item>
            <el-form-item label="专业代码" prop="code">
              <el-input v-model="form.code" placeholder="如：510203" />
            </el-form-item>
            <el-form-item label="专业名称" prop="major">
              <el-input v-model="form.major" placeholder="如：软件技术" />
            </el-form-item>
            <el-form-item label="学制" prop="duration">
              <el-select v-model="form.duration" placeholder="请选择" style="width: 100%">
                <el-option label="3 年制" value="3年" />
                <el-option label="2 年制" value="2年" />
                <el-option label="5 年制（3+2）" value="5年" />
              </el-select>
            </el-form-item>
            <el-form-item label="生源类型" prop="studentType">
              <el-select v-model="form.studentType" placeholder="请选择" style="width: 100%">
                <el-option label="高中毕业生" value="高中毕业生" />
                <el-option label="中职毕业生" value="中职毕业生" />
                <el-option label="同等学力" value="同等学力" />
              </el-select>
            </el-form-item>
            <el-form-item label="版本年份" prop="versionYear">
              <el-input-number v-model="form.versionYear" :min="2020" :max="2030" />
            </el-form-item>
            <el-form-item label="所属院系" prop="departmentId">
              <el-select v-model="form.departmentId" placeholder="请选择" style="width: 100%">
                <el-option v-for="d in departments" :key="d.id" :label="d.name" :value="d.id" />
              </el-select>
            </el-form-item>
            <el-form-item v-if="!isEdit" label="审批流程" prop="workflowId">
              <el-select
                v-model="form.workflowId"
                placeholder="默认走内置 4 步流程"
                clearable
                style="width: 100%"
                @change="onWorkflowChange"
              >
                <el-option
                  v-for="wf in workflows"
                  :key="wf.id"
                  :label="wf.name"
                  :value="wf.id"
                />
              </el-select>
              <div class="muted" style="font-size: 12px; margin-top: 4px">
                选定的流程在保存草稿时会被冻结，后续不可更改。ADMIN 可在"流程管理"中新增流程模板。
              </div>
            </el-form-item>
            <el-form-item v-if="!isEdit">
              <el-button @click="saveDraft" :loading="saving">保存草稿</el-button>
              <el-button type="primary" :loading="saving" @click="saveAndUpload">保存并上传文档</el-button>
            </el-form-item>
            <el-form-item v-else>
              <el-button @click="saveDraft" :loading="saving">保存修改</el-button>
              <el-button @click="$router.back()">取消</el-button>
            </el-form-item>
          </el-form>
        </el-col>

        <el-col :span="10">
          <div class="preview-panel">
            <div class="preview-header">
              <span style="font-weight: 600">流程预览</span>
              <el-tag v-if="selectedWorkflow" type="success" size="small">已选择</el-tag>
              <el-tag v-else type="info" size="small">默认 4 步</el-tag>
            </div>
            <div v-if="loadingWorkflows" class="preview-loading">加载中…</div>
            <div v-else>
              <div v-if="previewNodes.length" class="preview-steps">
                <el-steps :active="0" direction="vertical" finish-status="success" simple>
                  <el-step
                    v-for="(node, idx) in previewNodes"
                    :key="idx"
                    :title="node.name"
                    :description="nodeDesc(node)"
                  />
                </el-steps>
              </div>
              <el-empty v-else description="选择审批流程后将在此处预览节点" :image-size="80" />
            </div>
          </div>
        </el-col>
      </el-row>
    </el-card>

    <el-dialog v-model="uploadDialog" title="上传方案文档" width="520px" :close-on-click-modal="false">
      <p class="muted" style="margin-top: 0">请上传 .docx 格式的培养方案文档（≤ 20MB）。上传完成后系统将自动触发 AI 政策合规性审核。</p>
      <el-upload
        ref="uploadRef"
        drag
        :auto-upload="false"
        :limit="1"
        :on-change="onFileChange"
        :on-exceed="() => ElMessage.warning('仅支持单个文件')"
        accept=".docx,.pdf"
      >
        <el-icon style="font-size: 48px; color: #409eff"><UploadFilled /></el-icon>
        <div class="el-upload__text">
          拖拽文件到此处，或<em>点击上传</em>
        </div>
        <template #tip>
          <div class="el-upload__tip">支持 .docx 与 .pdf 格式。.pdf 仅作存档，不触发 AI 解析。</div>
        </template>
      </el-upload>
      <template #footer>
        <el-button @click="uploadDialog = false">取消</el-button>
        <el-button type="primary" :loading="uploading" :disabled="!pendingFile" @click="confirmUpload">开始上传并审核</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import request from '@/api/request';
import { workflowApi } from '@/api/workflows';

const route = useRoute();
const router = useRouter();
const isEdit = computed(() => !!route.params.id);
const formRef = ref();
const uploadRef = ref();
const saving = ref(false);
const uploading = ref(false);
const uploadDialog = ref(false);
const pendingFile = ref(null);
const departments = ref([]);
const workflows = ref([]);
const selectedWorkflow = ref(null);
const loadingWorkflows = ref(false);
const createdId = ref(null);

const form = reactive({
  name: '', code: '', major: '', duration: '3年',
  studentType: '高中毕业生', versionYear: 2026, departmentId: null,
  workflowId: null,
});

const rules = {
  name: [{ required: true, message: '请输入方案名称' }],
  code: [{ required: true, message: '请输入专业代码' }],
  major: [{ required: true, message: '请输入专业名称' }],
  duration: [{ required: true, message: '请选择学制' }],
  studentType: [{ required: true, message: '请选择生源类型' }],
  versionYear: [{ required: true, message: '请选择版本年份' }],
  departmentId: [{ required: true, message: '请选择院系' }],
};

const BUILTIN_PREVIEW = [
  { code: 'DEPT_REVIEW', name: '院长审核', approverScope: 'OWN_DEPT_DEAN', role: 'DEAN' },
  { code: 'ACADEMIC_REVIEW', name: '教务审核', approverScope: 'CUSTOM_USERS', role: 'ACADEMIC' },
  { code: 'PRESIDENT_REVIEW', name: '校长签发', approverScope: 'CUSTOM_USERS', role: 'PRESIDENT' },
  { code: 'END', name: '已发布' },
];

const previewNodes = computed(() => {
  if (selectedWorkflow.value) {
    return selectedWorkflow.value.nodes
      .filter((n) => n.code !== 'START')
      .map((n) => ({
        code: n.code,
        name: n.name,
        approverScope: n.approverScope,
        role: n.role,
      }));
  }
  return BUILTIN_PREVIEW;
});

const SCOPE_LABELS = {
  OWN_DEPT_DEAN: '本院系院长',
  ALL_DEAN: '所有院长',
  ALL_SIGN_DEAN: '所有院长会签',
  CUSTOM_USERS: '指定人员',
};

function nodeDesc(node) {
  if (node.code === 'END') return '流程结束，方案发布';
  if (node.approverScope) {
    const scope = SCOPE_LABELS[node.approverScope] || node.approverScope;
    return `${node.role || '审批人'} · ${scope}`;
  }
  return '';
}

function onWorkflowChange(id) {
  selectedWorkflow.value = id ? workflows.value.find((w) => w.id === id) : null;
}

onMounted(async () => {
  departments.value = await request.get('/departments');
  loadingWorkflows.value = true;
  try {
    workflows.value = await workflowApi.list();
  } catch (e) {
    console.warn('加载流程列表失败', e);
    workflows.value = [];
  } finally {
    loadingWorkflows.value = false;
  }
  if (isEdit.value) {
    const plan = await request.get(`/plans/${route.params.id}`);
    Object.assign(form, {
      name: plan.name, code: plan.code, major: plan.major,
      duration: plan.duration, studentType: plan.studentType,
      versionYear: plan.versionYear, departmentId: plan.departmentId,
    });
  }
});

async function saveDraft() {
  await formRef.value.validate();
  saving.value = true;
  try {
    const payload = { ...form };
    if (!payload.workflowId) delete payload.workflowId;
    if (isEdit.value) {
      delete payload.workflowId;
      await request.put(`/plans/${route.params.id}`, payload);
      ElMessage.success('已保存');
      router.back();
    } else {
      const plan = await request.post('/plans', payload);
      createdId.value = plan.id;
      ElMessage.success('草稿已保存，请上传方案文档');
      uploadDialog.value = true;
    }
  } finally { saving.value = false; }
}

function saveAndUpload() { saveDraft(); }

function onFileChange(file) { pendingFile.value = file.raw; }

async function confirmUpload() {
  if (!pendingFile.value) return;
  uploading.value = true;
  try {
    const fd = new FormData();
    fd.append('file', pendingFile.value);
    await request.post(`/plans/${createdId.value}/file`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    ElMessage.success('上传成功，AI 审核已触发');
    uploadDialog.value = false;
    router.push(`/plans/${createdId.value}`);
  } catch (e) { /* handled */ }
  finally { uploading.value = false; }
}
</script>

<style scoped>
.preview-panel {
  background: #fafbfc;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 16px;
  min-height: 400px;
}
.preview-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #ebeef5;
}
.preview-loading {
  color: #909399;
  font-size: 13px;
  padding: 20px 0;
  text-align: center;
}
.preview-steps {
  padding: 8px 0;
}
</style>
