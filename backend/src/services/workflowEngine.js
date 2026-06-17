/**
 * 工作流引擎 V2（动态版本）
 *
 * 数据约定：
 * - Plan.workflowSnapshot: 创建时冻结的 JSON，结构：
 *     {
 *       name: String,
 *       nodes: [{ code, name, role?, approverScope?, approverUserIds?, notifyUserIds? }],
 *       edges: [{ source, target }]
 *     }
 * - Plan.currentNodeCode: 当前节点 code（如 DEPT_REVIEW）
 * - ApprovalTask.approverId: 实际处理人；roleRequired 决定谁能看
 *
 * 兼容：
 * - 旧 plan（workflowSnapshot=null）走内置 BUILTIN_DEFAULT
 */

const prisma = require('../db');
const notify = require('./notification');

/**
 * 内置默认工作流（兼容老 plan）
 */
const BUILTIN_DEFAULT = {
  name: '内置标准 4 步流程',
  nodes: [
    { code: 'START', name: '开始' },
    { code: 'DEPT_REVIEW', name: '院长审核', role: 'DEAN', approverScope: 'OWN_DEPT_DEAN' },
    { code: 'ACADEMIC_REVIEW', name: '教务审核', role: 'ACADEMIC', approverScope: 'CUSTOM_USERS', approverUserIds: [] },
    { code: 'PRESIDENT_REVIEW', name: '校长签发', role: 'PRESIDENT', approverScope: 'CUSTOM_USERS', approverUserIds: [] },
    { code: 'END', name: '已发布' },
  ],
  edges: [
    { source: 'START', target: 'DEPT_REVIEW' },
    { source: 'DEPT_REVIEW', target: 'ACADEMIC_REVIEW' },
    { source: 'ACADEMIC_REVIEW', target: 'PRESIDENT_REVIEW' },
    { source: 'PRESIDENT_REVIEW', target: 'END' },
  ],
};

/**
 * 加载方案的工作流定义
 */
function loadPlanWorkflow(plan) {
  if (plan.workflowSnapshot) {
    try {
      return JSON.parse(plan.workflowSnapshot);
    } catch (e) {
      console.warn('workflowSnapshot 解析失败，走内置默认', e.message);
    }
  }
  return BUILTIN_DEFAULT;
}

/**
 * 查找节点的下一个节点 code
 */
function findNext(workflow, currentCode) {
  const edge = workflow.edges.find((e) => e.source === currentCode);
  return edge ? edge.target : null;
}

/**
 * 查找节点的上一个节点
 */
function findPrevious(workflow, currentCode) {
  if (!currentCode) return null;
  const edge = workflow.edges.find((e) => e.target === currentCode);
  return edge ? workflow.nodes.find((n) => n.code === edge.source) : null;
}

/**
 * 判断节点是否可作为"驳回回退目标"：
 * 仅 APPROVAL 节点（包含内置的 DEPT_REVIEW / ACADEMIC_REVIEW / PRESIDENT_REVIEW）可被回退
 * 排除 START / END / NOTIFY
 */
function isRollbackableNode(node) {
  if (!node) return false;
  if (['START', 'END', 'NOTIFY'].includes(node.code)) return false;
  // 内置审批节点或自定义 APPROVAL 节点均可
  return ['APPROVAL', 'DEPT_REVIEW', 'ACADEMIC_REVIEW', 'PRESIDENT_REVIEW'].includes(node.code);
}

/**
 * 查找 START 之后的第一个节点
 */
function findFirst(workflow) {
  const edge = workflow.edges.find((e) => e.source === 'START');
  return edge ? workflow.nodes.find((n) => n.code === edge.target) : null;
}

/**
 * 解析审批人 ID 列表
 */
async function resolveApprovers(node, plan) {
  if (!node) return [];
  switch (node.approverScope) {
    case 'OWN_DEPT_DEAN': {
      const users = await prisma.user.findMany({
        where: { role: 'DEAN', departmentId: plan.departmentId, status: 'ACTIVE' },
        select: { id: true },
      });
      return users.map((u) => u.id);
    }
    case 'ALL_DEAN': {
      const users = await prisma.user.findMany({
        where: { role: 'DEAN', status: 'ACTIVE' },
        select: { id: true },
      });
      return users.map((u) => u.id);
    }
    case 'ALL_SIGN_DEAN': {
      // 会签：所有 DEAN 都要通过；会创建 N 个任务，引擎检查全部通过
      const users = await prisma.user.findMany({
        where: { role: 'DEAN', status: 'ACTIVE' },
        select: { id: true },
      });
      return users.map((u) => u.id);
    }
    case 'CUSTOM_USERS': {
      try {
        return JSON.parse(node.approverUserIds || '[]');
      } catch {
        return [];
      }
    }
    default:
      return [];
  }
}

/**
 * 解析通知人 ID 列表
 */
function resolveNotifyUsers(node) {
  if (!node || !node.notifyUserIds) return [];
  try {
    return JSON.parse(node.notifyUserIds);
  } catch {
    return [];
  }
}

/**
 * 根据节点推导 plan.status（兼容旧字段）
 */
function derivePlanStatus(nodeCode) {
  if (nodeCode === 'END') return 'PUBLISHED';
  if (nodeCode === 'START' || nodeCode === null) return 'DRAFT';
  return nodeCode; // DEPT_REVIEW / ACADEMIC_REVIEW / PRESIDENT_REVIEW
}

/**
 * 启动节点（创建任务或发送通知）
 */
async function startNode(plan, node) {
  if (!node) {
    throw new Error('找不到 START 之后的第一个节点');
  }
  if (node.code === 'END') {
    // 直接结束（不太可能但兜底）
    await prisma.plan.update({
      where: { id: plan.id },
      data: {
        status: 'PUBLISHED',
        currentNodeCode: 'END',
        currentNode: '已发布',
        publishedAt: new Date(),
      },
    });
    return { nextNode: node, advanced: true };
  }
  if (node.code === 'APPROVAL' || ['DEPT_REVIEW', 'ACADEMIC_REVIEW', 'PRESIDENT_REVIEW'].includes(node.code)) {
    const approvers = await resolveApprovers(node, plan);
    for (const userId of approvers) {
      await prisma.approvalTask.create({
        data: {
          planId: plan.id,
          nodeName: node.name,
          roleRequired: node.role || 'DEAN',
          action: 'PENDING',
          approverId: userId, // 暂存为该任务的指派人
        },
      });
    }
    await prisma.plan.update({
      where: { id: plan.id },
      data: {
        status: derivePlanStatus(node.code),
        currentNodeCode: node.code,
        currentNode: node.name,
        submittedAt: plan.submittedAt || new Date(),
      },
    });
    return { nextNode: node, approvers, advanced: true };
  }
  if (node.code === 'NOTIFY') {
    const userIds = resolveNotifyUsers(node);
    for (const userId of userIds) {
      try {
        await notify.createOne(
          userId,
          'FLOW_NOTIFY',
          `抄送：${plan.name}`,
          `工作流节点【${node.name}】抄送通知`,
          'Plan',
          plan.id
        );
      } catch (e) {
        console.warn('抄送通知失败：', e.message);
      }
    }
    // 抄送不阻塞，继续到下一节点
    const nextCode = findNext(loadPlanWorkflow(plan), node.code);
    const nextNode = nextCode
      ? loadPlanWorkflow(plan).nodes.find((n) => n.code === nextCode)
      : null;
    if (nextNode) {
      return startNode(plan, nextNode);
    }
    return { nextNode: null, advanced: true };
  }
  // 未知节点 code → 跳过
  console.warn('未知节点 code：', node.code);
  const nextCode = findNext(loadPlanWorkflow(plan), node.code);
  const nextNode = nextCode
    ? loadPlanWorkflow(plan).nodes.find((n) => n.code === nextCode)
    : null;
  return startNode(plan, nextNode);
}

/**
 * 提交审批：草稿 → 第一个节点
 */
async function submit(planId, user) {
  const plan = await prisma.plan.findUnique({ where: { id: planId } });
  if (!plan) throw new Error('方案不存在');
  if (plan.createdById !== user.id) throw new Error('只有发起人可以提交');
  if (plan.status !== 'DRAFT') throw new Error('当前状态不可提交');
  if (!plan.filePath) throw new Error('请先上传方案文档');

  const workflow = loadPlanWorkflow(plan);
  const firstNode = findFirst(workflow);
  if (!firstNode) throw new Error('工作流定义错误：缺少 START 到下一节点的边');

  const updated = await prisma.plan.findUnique({
    where: { id: plan.id },
    include: { createdBy: { select: { name: true, id: true } } },
  });
  const result = await startNode(updated, firstNode);

  // 通知：同部门 DEAN + 同部门其他教师/院长
  await notify.onPlanSubmitted(updated);
  return updated;
}

/**
 * 同意：当前任务 → 下一节点
 *
 * @param {number} taskId - ApprovalTask.id
 * @param {User} user
 * @param {string} comment
 */
async function approve(taskId, user, comment) {
  const task = await prisma.approvalTask.findUnique({
    where: { id: taskId },
    include: { plan: true },
  });
  if (!task) throw new Error('任务不存在');
  if (task.action !== 'PENDING') throw new Error('该任务已处理');
  if (task.roleRequired !== user.role) throw new Error('当前用户无审批权限');

  // 处理任务
  await prisma.approvalTask.update({
    where: { id: taskId },
    data: {
      approverId: user.id,
      action: 'APPROVED',
      comment: comment || '',
      processedAt: new Date(),
    },
  });

  const plan = await prisma.plan.findUnique({ where: { id: task.planId } });
  const workflow = loadPlanWorkflow(plan);
  const currentNode = workflow.nodes.find((n) => n.code === plan.currentNodeCode);
  if (!currentNode) throw new Error('找不到当前节点定义：' + plan.currentNodeCode);

  // 会签模式：检查是否所有相关任务都已通过
  if (currentNode.approverScope === 'ALL_SIGN_DEAN') {
    const remaining = await prisma.approvalTask.count({
      where: {
        planId: plan.id,
        roleRequired: currentNode.role,
        action: 'PENDING',
      },
    });
    if (remaining > 0) {
      // 还有其他人未签，等待
      return { nextStatus: plan.status, waiting: true };
    }
  }

  // 进入下一节点
  const nextCode = findNext(workflow, plan.currentNodeCode);
  const nextNode = nextCode ? workflow.nodes.find((n) => n.code === nextCode) : null;

  if (!nextNode || nextNode.code === 'END') {
    // 已发布
    await prisma.plan.update({
      where: { id: plan.id },
      data: {
        status: 'PUBLISHED',
        currentNodeCode: 'END',
        currentNode: '已发布',
        publishedAt: new Date(),
      },
    });
    const fullPlan = await prisma.plan.findUnique({ where: { id: plan.id } });
    await notify.onPlanApproved(fullPlan, null, true);
    return { nextStatus: 'PUBLISHED' };
  }

  // 进入下一节点
  await prisma.plan.update({
    where: { id: plan.id },
    data: {
      currentNodeCode: nextNode.code,
      currentNode: nextNode.name,
    },
  });
  const updated = await prisma.plan.findUnique({ where: { id: plan.id } });
  await startNode(updated, nextNode);

  // 通知发起人：通过
  const nextNodeName = nextNode.name;
  await notify.onPlanApproved(updated, nextNodeName, false);
  return { nextStatus: derivePlanStatus(nextNode.code) };
}

/**
 * 驳回：可选择退回给发起人 / 退回至上一节点
 *
 * @param {number} taskId - ApprovalTask.id
 * @param {User} user
 * @param {string} comment
 * @param {'CREATOR' | 'PREV_NODE'} rejectTarget - 驳回目标
 */
async function reject(taskId, user, comment, rejectTarget = 'CREATOR') {
  const task = await prisma.approvalTask.findUnique({
    where: { id: taskId },
    include: { plan: true },
  });
  if (!task) throw new Error('任务不存在');
  if (task.action !== 'PENDING') throw new Error('该任务已处理');
  if (task.roleRequired !== user.role) throw new Error('当前用户无审批权限');

  const plan = task.plan;
  const workflow = loadPlanWorkflow(plan);
  const currentNode = workflow.nodes.find((n) => n.code === plan.currentNodeCode);
  if (!currentNode) throw new Error('找不到当前节点定义：' + plan.currentNodeCode);

  // 解析驳回目标
  let targetNode = null;
  if (rejectTarget === 'PREV_NODE') {
    targetNode = findPrevious(workflow, plan.currentNodeCode);
    if (!targetNode || !isRollbackableNode(targetNode)) {
      throw new Error('当前节点已是流程起点，无法回退到上一审批节点');
    }
  } else if (rejectTarget !== 'CREATOR') {
    throw new Error('无效的驳回目标: ' + rejectTarget);
  }

  // 1. 标记当前任务为 REJECTED
  await prisma.approvalTask.update({
    where: { id: taskId },
    data: {
      approverId: user.id,
      action: 'REJECTED',
      comment: comment || '驳回',
      processedAt: new Date(),
    },
  });

  // 2. 同节点其他 PENDING 任务置为 OBSOLETE（会签场景）
  await prisma.approvalTask.updateMany({
    where: {
      planId: task.planId,
      id: { not: taskId },
      action: 'PENDING',
    },
    data: { action: 'OBSOLETE', processedAt: new Date() },
  });

  if (rejectTarget === 'PREV_NODE' && targetNode) {
    // === 退回至上一节点 ===
    // 3a. 为上一节点重新生成审批任务
    const approvers = await resolveApprovers(targetNode, plan);
    for (const userId of approvers) {
      await prisma.approvalTask.create({
        data: {
          planId: plan.id,
          nodeName: targetNode.name,
          roleRequired: targetNode.role,
          action: 'PENDING',
          approverId: userId,
        },
      });
    }
    // 4a. 更新方案状态为上一节点
    await prisma.plan.update({
      where: { id: plan.id },
      data: {
        status: derivePlanStatus(targetNode.code),
        currentNodeCode: targetNode.code,
        currentNode: targetNode.name,
      },
    });
    const fullPlan = await prisma.plan.findUnique({ where: { id: plan.id } });

    // 5a. 通知发起人：被回退到某节点
    if (fullPlan) {
      await notify.onPlanRollback(fullPlan, comment, user.name, targetNode.name);
    }
    // 6a. 通知新审批人：驳回重审
    for (const userId of approvers) {
      try {
        await notify.createOne(
          userId,
          'NEW_TASK',
          `驳回重审：${plan.name}`,
          `${user.name} 将方案退回至【${targetNode.name}】，请重新审批`,
          'Plan',
          plan.id
        );
      } catch (e) {
        console.warn('驳回重审通知失败：', e.message);
      }
    }
    return { rejected: true, target: 'PREV_NODE', targetNodeName: targetNode.name };
  }

  // === 退回给发起人 ===
  await prisma.plan.update({
    where: { id: plan.id },
    data: {
      status: 'DRAFT',
      currentNode: '已驳回，待修改',
      currentNodeCode: null,
    },
  });
  const fullPlan = await prisma.plan.findUnique({ where: { id: plan.id } });
  if (fullPlan) {
    await notify.onPlanRejected(fullPlan, comment, user.name);
  }
  return { rejected: true, target: 'CREATOR' };
}

/**
 * 数据权限过滤
 */
function planVisibilityWhere(user) {
  if (['PRESIDENT', 'ACADEMIC', 'ADMIN'].includes(user.role)) return {};
  if (user.role === 'DEAN') return { departmentId: user.departmentId };
  if (user.role === 'TEACHER') {
    return {
      OR: [
        { createdById: user.id },
        { departmentId: user.departmentId },
      ],
    };
  }
  return { id: -1 };
}

/**
 * 校验工作流定义
 */
function validateWorkflow(workflow) {
  const errors = [];
  if (!workflow || !workflow.name) {
    errors.push({ code: 'NO_NAME', message: '缺少工作流名称' });
  }
  const nodes = workflow.nodes || [];
  const edges = workflow.edges || [];
  const codes = new Set(nodes.map((n) => n.code));

  if (!codes.has('START')) {
    errors.push({ code: 'NO_START', message: '缺少开始节点' });
  }
  if (!codes.has('END')) {
    errors.push({ code: 'NO_END', message: '缺少结束节点' });
  }
  if (codes.size !== nodes.length) {
    errors.push({ code: 'DUPLICATE_CODE', message: '节点 code 不能重复' });
  }

  // APPROVAL 节点必须有 role
  for (const n of nodes) {
    if (n.code === 'APPROVAL' && !n.role) {
      errors.push({ code: 'NO_ROLE', message: `节点【${n.name}】缺少审批角色` });
    }
    if (n.code === 'NOTIFY' && (!n.notifyUserIds || n.notifyUserIds === '[]')) {
      errors.push({ code: 'NO_NOTIFY_USERS', message: `抄送节点【${n.name}】缺少通知人` });
    }
  }

  // 检查连通性：所有非 START 节点必须能从 START 到达
  if (codes.has('START')) {
    const reachable = new Set(['START']);
    let changed = true;
    while (changed) {
      changed = false;
      for (const e of edges) {
        if (reachable.has(e.source) && !reachable.has(e.target)) {
          reachable.add(e.target);
          changed = true;
        }
      }
    }
    for (const n of nodes) {
      if (!reachable.has(n.code)) {
        errors.push({ code: 'UNREACHABLE', message: `节点【${n.name}】不可达` });
      }
    }
  }

  // 检查环（基本 DAG）：用拓扑排序
  const indeg = new Map(nodes.map((n) => [n.code, 0]));
  for (const e of edges) {
    if (indeg.has(e.target)) indeg.set(e.target, indeg.get(e.target) + 1);
  }
  const queue = [];
  for (const [code, d] of indeg) if (d === 0) queue.push(code);
  let count = 0;
  while (queue.length) {
    const c = queue.shift();
    count++;
    for (const e of edges.filter((x) => x.source === c)) {
      indeg.set(e.target, indeg.get(e.target) - 1);
      if (indeg.get(e.target) === 0) queue.push(e.target);
    }
  }
  if (count !== nodes.length) {
    errors.push({ code: 'CYCLE', message: '工作流不能包含环' });
  }

  return errors;
}

module.exports = {
  BUILTIN_DEFAULT,
  loadPlanWorkflow,
  findNext,
  findFirst,
  findPrevious,
  isRollbackableNode,
  resolveApprovers,
  submit,
  approve,
  reject,
  planVisibilityWhere,
  validateWorkflow,
};
