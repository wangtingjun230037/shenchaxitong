/**
 * 生成一个用于测试的 .docx 培养方案样本
 */
const fs = require('fs');
const path = require('path');
const { Document, Packer, Paragraph, HeadingLevel, TextRun, AlignmentType } = require('docx');

const doc = new Document({
  sections: [{
    properties: {},
    children: [
      new Paragraph({
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: '软件技术专业人才培养方案（2026版）', bold: true, size: 36 })],
      }),
      new Paragraph({ children: [new TextRun({ text: '专业代码：510203', size: 24 })] }),
      new Paragraph({ children: [new TextRun({ text: '学制：3年   生源：高中毕业生   学历：大专', size: 24 })] }),

      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: '一、培养目标', bold: true })] }),
      new Paragraph({ children: [new TextRun({ text: '本专业培养德智体美劳全面发展，掌握软件技术基础理论、主流开发框架与工程实践能力，能在信息技术行业从事软件开发、测试、运维等工作的高素质技术技能人才。' })] }),
      new Paragraph({ children: [new TextRun({ text: '学生应熟悉软件工程方法论，掌握 Java、Python、JavaScript 等主流编程语言，了解云原生、大数据、人工智能等新一代信息技术。' })] }),

      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: '二、培养规格', bold: true })] }),
      new Paragraph({ children: [new TextRun({ text: '1. 思想政治素质：坚定理想信念，践行社会主义核心价值观。' })] }),
      new Paragraph({ children: [new TextRun({ text: '2. 知识结构：掌握计算机基础、程序设计、数据库、软件工程等专业知识。' })] }),
      new Paragraph({ children: [new TextRun({ text: '3. 能力结构：具备需求分析、系统设计、编码实现、测试部署的工程能力。' })] }),
      new Paragraph({ children: [new TextRun({ text: '4. 素质结构：具有团队协作、沟通表达、持续学习的职业素养。' })] }),

      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: '三、课程体系设置', bold: true })] }),
      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: '（一）公共基础课程', bold: true })] }),
      new Paragraph({ children: [new TextRun({ text: '思想政治（84学时）、语文（68学时）、数学（102学时）、英语（136学时）、计算机应用基础（68学时）、体育与健康（136学时）、心理健康（34学时）、艺术（34学时）。' })] }),
      new Paragraph({ children: [new TextRun({ text: '公共基础课合计 660 学时，占总学时比例约 22%。' })] }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: '（二）专业基础课程', bold: true })] }),
      new Paragraph({ children: [new TextRun({ text: '程序设计基础（102学时）、数据结构（68学时）、数据库原理（68学时）、计算机网络（68学时）、Linux 操作系统（51学时）。' })] }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: '（三）专业核心课程', bold: true })] }),
      new Paragraph({ children: [new TextRun({ text: 'Java 企业级开发（102学时）、Python 数据分析（68学时）、Web 前端开发（102学时）、软件工程与项目管理（68学时）、软件测试技术（68学时）、人工智能导论（51学时）。' })] }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: '（四）专业拓展课程', bold: true })] }),
      new Paragraph({ children: [new TextRun({ text: '云计算与大数据技术（68学时）、鸿蒙应用开发（51学时）、网络安全基础（51学时）。' })] }),

      new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: '（五）实践教学', bold: true })] }),
      new Paragraph({ children: [new TextRun({ text: '课程实训 408 学时、专项实训 272 学时、综合实训 272 学时、跟岗实习 272 学时、顶岗实习 510 学时。' })] }),
      new Paragraph({ children: [new TextRun({ text: '实践教学总学时约 1734 学时，占总学时比例约 58%。' })] }),

      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: '四、教学进程', bold: true })] }),
      new Paragraph({ children: [new TextRun({ text: '总学时 2980，总学分 162。理论学时 1246，实践学时 1734。' })] }),
      new Paragraph({ children: [new TextRun({ text: '选修课包括艺术鉴赏、传统文化、大数据技术前沿等，学时约 340，占比约 11%。' })] }),

      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: '五、岗课赛证融通', bold: true })] }),
      new Paragraph({ children: [new TextRun({ text: '1. 核心岗位：Java 开发工程师、Web 前端工程师、软件测试工程师、运维工程师。' })] }),
      new Paragraph({ children: [new TextRun({ text: '2. 核心课程：Java 企业级开发、Web 前端开发、软件测试技术。' })] }),
      new Paragraph({ children: [new TextRun({ text: '3. 职业技能大赛：软件测试赛、移动应用开发赛。' })] }),
      new Paragraph({ children: [new TextRun({ text: '4. 职业资格证书：计算机技术与软件专业技术资格（水平）考试、阿里云 ACA/ACP 认证。' })] }),

      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: '六、实施保障', bold: true })] }),
      new Paragraph({ children: [new TextRun({ text: '配备专兼职教师 18 人，其中双师型教师 14 人；建有软件开发、软件测试、大数据等 5 个校内实训室，与东软、华为等 6 家企业建有校外实习基地。' })] }),
    ],
  }],
});

Packer.toBuffer(doc).then((buf) => {
  const out = path.join(__dirname, 'test-plan.docx');
  fs.writeFileSync(out, buf);
  console.log('已生成测试 docx:', out, buf.length, 'bytes');
});
