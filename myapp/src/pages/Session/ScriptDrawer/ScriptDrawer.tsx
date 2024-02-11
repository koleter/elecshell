import React, {useEffect, useState} from "react";
import {Button, Drawer, Form, Input, message, Modal, Radio} from "antd";
import Upload from "../components/upload/Upload"
import {ProList} from "@ant-design/pro-components";
import {FormattedMessage} from "@@/plugin-locale/localeExports";
import {request} from "@@/plugin-request/request";
import util, {showMessage} from "@/util";
import {sessionIdMapFileName, sessionIdRef} from "@/pages/Session/main/Main";
import Spliter from "@/pages/Session/components/spliter/Spliter";

const ScriptDrawer: React.FC = (props) => {
  // @ts-ignore
  const {activeKey, sessions, drawerOpen, setDrawerOpen} = props;
  const [editScriptForm] = Form.useForm();

  const [scriptData, setScriptData] = useState([]);
  const [scriptSearchValue, setScriptSearchValue] = useState("");
  const [editScriptModalVisiable, setEditScriptModalVisiable] = useState(false);
  const [refreshScriptData, setRefreshScriptData] = useState(0);
  const [addScriptModalVisiable, setAddScriptModalVisiable] = useState(false);
  const [addScriptForm] = Form.useForm();

  useEffect(() => {
    request(util.baseUrl + 'conf', {
      method: 'GET',
      params: {
        type: 'ScriptConfig',
      },
    }).then(res => {
      if (res.status !== 'success') {
        message[res.status](res.msg);
      }
      setScriptData(res.scriptData);
    })
  }, [refreshScriptData])

  function genScriptFormProperties() {
    return <>
      <Form.Item
        label="脚本名"
        name="name"
        initialValue={""}
        rules={[{required: true, message: '请输入脚本名!'}]}
      >
        <Input/>
      </Form.Item>

      <Form.Item
        label="python脚本文件路径"
        name="scriptPath"
        getValueFromEvent={(args) => {
          return args.path
        }}
        rules={[{required: true, message: '请选择python脚本文件!'}]}
      >
        <Upload>
        </Upload>
      </Form.Item>
    </>
  }

  return <>
    <Drawer
      title={`脚本`}
      placement="right"
      onClose={() => {
        setDrawerOpen(false);
      }}
      open={drawerOpen}
      size={'large'}
    >

      <ProList
        rowKey="name"
        dataSource={scriptData.filter(item => (!item.scriptOwner || item.scriptOwner == sessionIdMapFileName[activeKey]) && item.title.name.indexOf(scriptSearchValue) > -1)}
        metas={{
          title: {
            render: (text, row) => {
              return <Button onClick={() => {
                // 确保当前存在活跃的session
                const sessionList = sessions.filter(session => session.key == activeKey);
                if (sessionList.length != 1 || !sessionList[0].isConnected) {
                  showMessage({
                    status: 'error',
                    content: 'scripts cannot be executed in a closed session'
                  });
                  return;
                }

                sessionIdRef[activeKey].send({
                  type: 'exec',
                  path: row.scriptPath,
                  sessionId: activeKey,
                  xshConfId: sessionList[0].sessionConfId
                })
              }
              }>{text.name}</Button>
            }
          },
          actions: {
            render: (text, row) => [
              <a
                key="link"
                onClick={() => {
                  const fields = Object.assign(row, {name: row.title.name})
                  editScriptForm.setFieldsValue(fields);
                  setEditScriptModalVisiable(true);
                }}
              >
                <FormattedMessage
                  key="loginWith"
                  id="pages.session.edit"
                  defaultMessage="编辑"
                />
              </a>,
              <a
                key="view"
                onClick={() => {
                  request(util.baseUrl + 'conf', {
                    method: 'POST',
                    body: JSON.stringify({
                      type: 'ScriptConfig',
                      args: {
                        type: 'deleteFile',
                        path: row.file
                      }
                    }),
                  }).then(res => {
                    message[res.status](res.msg);
                    if (res.status == 'success') {
                      setRefreshScriptData(e => e + 1);
                    }
                  })
                }}
              >
                <FormattedMessage
                  key="pages.session.delete"
                  id="pages.session.delete"
                  defaultMessage="删除"
                />
              </a>,
            ],
          },
        }}
        toolBarRender={() => {
          return [
            <Form.Item
              label={<FormattedMessage
                key="loginWith"
                id="pages.session.search"
                defaultMessage="查询"
              />}
            >
              <Input style={{float: 'left'}} onChange={(e) => {
                const {value: inputValue} = e.target;
                setScriptSearchValue(inputValue);
              }}/>
            </Form.Item>
            ,
            <Form.Item>
              <Button key="add" type="primary" onClick={() => {
                addScriptForm.resetFields();
                setAddScriptModalVisiable(true);
              }}>
                <FormattedMessage
                  key="loginWith"
                  id="pages.session.add"
                  defaultMessage="添加"
                />
              </Button>
            </Form.Item>
          ];
        }}
      />
    </Drawer>

    <Modal
      maskClosable={false}
      open={addScriptModalVisiable}
      closable={false}
      onOk={() => {
        addScriptForm.submit();
      }}
      onCancel={() => {
        setAddScriptModalVisiable(false);
      }}
    >
      <Form
        form={addScriptForm}
        onFinish={(formInfo) => {
          if (formInfo.scriptOwner == 'common') {
            formInfo.scriptOwner = "";
          } else {
            formInfo.scriptOwner = sessionIdMapFileName[activeKey];
          }
          request(util.baseUrl + 'conf', {
            method: 'POST',
            body: JSON.stringify({
              type: 'ScriptConfig',
              args: {
                type: 'addFile',
                ...formInfo
              }
            }),
          }).then(res => {
            message[res.status](res.msg);
            if (res.status == 'success') {
              setAddScriptModalVisiable(false);
              setRefreshScriptData(e => e + 1);
            }
          })
        }}
      >
        {genScriptFormProperties()}
        <Form.Item
          name="scriptOwner"
          rules={[() => ({
            validator(e, value) {
              if (value) {
                return Promise.resolve();
              }
              return Promise.reject(new Error('请选择按钮类型!'));
            },
          })]}
          label={<FormattedMessage
            key="pages.session.type"
            id="pages.session.type"
            defaultMessage="类型"
          />}>
          <Radio.Group>
            <Radio value="common">
              <FormattedMessage
                key="pages.session.common"
                id="pages.session.common"
                defaultMessage="公共"
              /> </Radio>
            <Radio value={activeKey}>
              <FormattedMessage
                key="pages.session.currentSession"
                id="pages.session.currentSession"
                defaultMessage="当前会话"
              /> </Radio>
          </Radio.Group>
        </Form.Item>
      </Form>
    </Modal>

    <Modal
      maskClosable={false}
      open={editScriptModalVisiable}
      closable={false}
      onOk={() => {
        editScriptForm.submit();
      }}
      onCancel={() => {
        setEditScriptModalVisiable(false);
      }}
    >
      <Form
        form={editScriptForm}
        onFinish={(formInfo) => {
          console.log(formInfo)
          request(util.baseUrl + 'conf', {
            method: 'POST',
            body: JSON.stringify({
              type: 'ScriptConfig',
              args: {
                type: 'editScript',
                ...formInfo
              }
            }),
          }).then(res => {
            message[res.status](res.msg);
            if (res.status == 'success') {
              setEditScriptModalVisiable(false);
              setRefreshScriptData(e => e + 1);
            }
          })
        }}
      >
        <Form.Item
          name="file"
          style={{display: 'none'}}
        >
          <Input/>
        </Form.Item>
        {genScriptFormProperties()}
      </Form>
    </Modal>
  </>
}

export default ScriptDrawer;
