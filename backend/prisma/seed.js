/**
 * 预置数据脚本
 * - 5 个测试账号（密码统一 123456，bcrypt 哈希）
 * - 3 个部门
 * - 内置政策知识库文件
 */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  console.log('开始初始化预置数据...');

  // 清空
  await prisma.auditLog.deleteMany();
  await prisma.aIReport.deleteMany();
  await prisma.approvalTask.deleteMany();
  await prisma.plan.deleteMany();
  await prisma.user.deleteMany();
  await prisma.department.deleteMany();

  // 部门
  const csDept = await prisma.department.create({ data: { name: '计算机学院' } });
  const academicDept = await prisma.department.create({ data: { name: '教务处' } });
  const leaderDept = await prisma.department.create({ data: { name: '校领导' } });
  console.log(`已创建 3 个部门`);

  // 用户
  const passwordHash = await bcrypt.hash('123456', 10);
  await prisma.user.createMany({
    data: [
      { username: 'teacher_zhang',  name: '张老师',   role: 'TEACHER',   passwordHash, departmentId: csDept.id },
      { username: 'dean_li',        name: '李院长',   role: 'DEAN',      passwordHash, departmentId: csDept.id },
      { username: 'academic_wang',  name: '王主任',   role: 'ACADEMIC',  passwordHash, departmentId: academicDept.id },
      { username: 'president_zhao', name: '赵校长',   role: 'PRESIDENT', passwordHash, departmentId: leaderDept.id },
      { username: 'admin',          name: '系统管理员', role: 'ADMIN',    passwordHash, departmentId: leaderDept.id },
    ],
  });
  console.log(`已创建 5 个预置账号（密码统一 123456）`);

  // 内置政策知识库
  const policyDir = path.join(__dirname, '..', 'src', 'policies');
  if (!fs.existsSync(policyDir)) fs.mkdirSync(policyDir, { recursive: true });
  const policyPath = path.join(policyDir, 'teaching-standards.txt');
  if (!fs.existsSync(policyPath)) {
    fs.writeFileSync(policyPath, POLICY_TEXT, 'utf-8');
    console.log('已生成内置政策知识库文件');
  }

  console.log('预置数据初始化完成 ✓');
  console.log('\n登录账号:');
  console.log('  teacher_zhang  (专业带头人)');
  console.log('  dean_li        (院长)');
  console.log('  academic_wang  (教务处)');
  console.log('  president_zhao (校长)');
  console.log('  admin          (管理员)');
  console.log('  密码: 123456');
}

const POLICY_TEXT = `
教育部关于职业院校专业人才培养方案制订与实施工作的指导意见（精简版）

一、总体要求
1. 培养方案应体现德技并修、德智体美劳全面发展。
2. 坚持产教融合、校企"双元"育人，对接行业最新技术、工艺、规范。
3. 总学时一般控制在 2500-3000 之间，总学分一般不超过 170 学分。
4. 公共基础课程学时占总学时的比例不低于 25%。
5. 实践性教学学时（含认识实习、跟岗实习、顶岗实习等）占总学时 50% 以上。
6. 选修课学时比例不低于 10%。

二、课程设置
1. 公共基础课程：包括思想政治、语文、数学、英语、计算机应用基础、体育与健康、艺术（音乐/美术）、心理健康等。
2. 专业（技能）课程：包括专业基础课程、专业核心课程、专业拓展课程，并涵盖实训实习。
3. 实践教学：包含课程内实训、专项实训、综合实训、跟岗实习、顶岗实习等多种形式。

三、产教融合
1. 课程内容应紧密对接产业升级和技术发展趋势，及时引入新技术、新工艺、新规范。
2. 鼓励引入人工智能、大数据、云计算、物联网等新一代信息技术。
3. 推动"岗课赛证"融通：培养目标→课程体系→技能竞赛→职业资格证书相互支撑。

四、考核评价
1. 建立多元评价体系：过程性考核 + 终结性考核。
2. 鼓励引入职业技能等级证书考核、职业技能大赛成绩作为评价依据。

五、制定与实施
1. 培养方案须经专业建设指导委员会论证、院系审核、学校审批。
2. 每 3 年修订一次，重大调整须重新履行审批程序。
3. 各专业应于每年 6 月底前完成下一级新生培养方案的制订与审定。
`;

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
