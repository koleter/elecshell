import React, {useState, useEffect} from "react";
import {Button, Upload} from "antd";
import {UploadOutlined} from '@ant-design/icons';

const UploadInFormItem = (props) => {
  const {value, onChange} = props;
  // console.log("value", value)

  const [fileList, setFileList] = useState(value ? [{
    name: value,
    status: 'done',
    url: value,
  }] : []);

  useEffect(() => {
    setFileList([{
      name: value,
      status: 'done',
      url: value,
    }]);
  }, [value])

  return <Upload maxCount={1}
                 onPreview={(file) => {
                     console.log("onPreview", file);
                     electronAPI.ipcRenderer.send('switchFileInExploer', file.name);
                 }}
                 onChange={(e) => {
                   // console.log(e);
                   var path = e?.file?.originFileObj?.path || "";
                   if (path) {
                     setFileList([{
                       name: path,
                       status: 'done',
                       url: path,
                     }]);
                   } else {
                     setFileList([]);
                   }

                   onChange?.({
                     path: path,
                   });
                 }} fileList={fileList}>
    <Button icon={<UploadOutlined/>}>Click to Upload</Button>
  </Upload>
}

export default UploadInFormItem;
